#!/usr/bin/env bash
# Đóng gói 1 tool rồi phát hành lên GitHub Releases, sau đó gắn link tải vào tracker.
#   bash tools/publish.sh arc
# Cần: gh đã đăng nhập (gh auth login), python3, tar.
set -euo pipefail
cd "$(dirname "$0")"
ID="${1:?Dùng: bash tools/publish.sh <id-tool>}"
REPO_DIR="$(cd .. && pwd)"
[[ -f "$ID/tool.json" ]] || { echo "Không thấy tools/$ID/tool.json"; exit 1; }
VER="$(python3 -c "import json;print(json.load(open('$ID/tool.json'))['version'])")"
NAME="$(python3 -c "import json;print(json.load(open('$ID/tool.json'))['name'])")"
KEO="$(python3 -c "import json;print(json.load(open('$ID/tool.json'))['keo'])")"
REPO="$(python3 -c "import json;print(json.load(open('$REPO_DIR/airdrops.json'))['repo'])")"
TAG="tool-$ID-v$VER"

echo "▶ Cài công cụ đóng gói (lần đầu hơi lâu)"
npm install --no-audit --no-fund --silent
node build.mjs "$ID"

echo "▶ Phát hành $TAG lên GitHub Releases ($REPO)"
NOTES="$(python3 -c "import json;print(json.load(open('$ID/tool.json')).get('notes',''))")"
shopt -s nullglob; ASSETS=(dist/"$ID"/*.zip dist/"$ID"/*.tar.gz); shopt -u nullglob
if gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then
  gh release upload "$TAG" "${ASSETS[@]}" -R "$REPO" --clobber
else
  gh release create "$TAG" "${ASSETS[@]}" -R "$REPO" --title "$NAME v$VER" --notes "$NOTES"
fi

echo "▶ Gắn link tải vào airdrops.json (kèo $KEO)"
python3 - "$REPO_DIR/airdrops.json" "$ID" "$VER" "$NAME" "$KEO" "$REPO" "$TAG" "$NOTES" <<'PY'
import json,sys,os,glob
p,i,ver,name,keo,repo,tag,notes=sys.argv[1:9]
d=json.load(open(p,encoding='utf-8'))
base=f"https://github.com/{repo}/releases/download/{tag}/"
dl={}
if os.path.exists(f"dist/{i}/ltfarm-{i}-linux-x64.tar.gz"): dl["linux"]=base+f"ltfarm-{i}-linux-x64.tar.gz"
if os.path.exists(f"dist/{i}/ltfarm-{i}-windows-x64.zip"): dl["windows"]=base+f"ltfarm-{i}-windows-x64.zip"
found=False
for a in d["airdrops"]:
    if a["id"]==keo:
        a["tool"]={"id":i,"name":name,"version":ver,"notes":notes,"downloads":dl,"release":f"https://github.com/{repo}/releases/tag/{tag}"}
        found=True
if not found: sys.exit(f"Không thấy kèo {keo} trong airdrops.json")
json.dump(d,open(p,'w',encoding='utf-8'),ensure_ascii=False,indent=2); open(p,'a').write("\n")
print("downloads:",dl)
PY

cd "$REPO_DIR"
git add airdrops.json && git commit -m "Phát hành $NAME v$VER" && git push
echo "✅ Xong! Trên tracker, kèo $KEO sẽ có nút ⬇️ Tải tool sau ~1 phút."
