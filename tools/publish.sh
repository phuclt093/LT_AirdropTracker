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
        mode=json.load(open(f"{i}/tool.json",encoding="utf-8")).get("mode","gui")
        a["tool"]={"id":i,"name":name,"version":ver,"mode":mode,"notes":notes,"downloads":dl,"release":f"https://github.com/{repo}/releases/tag/{tag}"}
        found=True
if not found: sys.exit(f"Không thấy kèo {keo} trong airdrops.json")
json.dump(d,open(p,'w',encoding='utf-8'),ensure_ascii=False,indent=2); open(p,'a').write("\n")
print("downloads:",dl)
PY

cd "$REPO_DIR"
git add airdrops.json
git commit -q -m "Phát hành $NAME v$VER" || { echo "airdrops.json không đổi — bỏ qua commit"; exit 0; }

# main có thể được bảo vệ (bắt buộc qua Pull Request) → thử push thẳng, không được thì tự mở PR rồi merge
if git push -q 2>/dev/null; then
  echo "✅ Xong! Trên tracker, kèo $KEO sẽ có nút ⬇️ Tải tool sau ~1 phút."
  exit 0
fi
echo "▶ main được bảo vệ — tạo Pull Request để gắn link tải"
BR="publish/$ID-v$VER"
git branch -f "$BR" HEAD
git push -q -f -u origin "$BR"
git reset -q --hard "origin/main"   # main trên máy trở lại giống GitHub; commit nằm ở nhánh $BR
PR_URL="$(gh pr create -R "$REPO" --base main --head "$BR" --title "Phát hành $NAME v$VER" --body "Gắn link tải $NAME v$VER vào airdrops.json (tạo tự động bởi tools/publish.sh)." 2>/dev/null || gh pr view "$BR" -R "$REPO" --json url -q .url)"
echo "PR: $PR_URL"
if gh pr merge "$BR" -R "$REPO" --merge --delete-branch 2>/dev/null; then
  git pull -q --ff-only || true
  echo "✅ Đã merge. Trên tracker, kèo $KEO sẽ có nút ⬇️ Tải tool sau ~1 phút."
else
  echo "⚠️  Chưa tự merge được (có thể cần review/kiểm tra). Mở link PR ở trên, bấm Merge là xong."
fi
