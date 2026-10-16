#!/usr/bin/env python3
"""Собирает prototype/index.html: один самодостаточный файл (данные + уменьшенные картинки).

Исходники: content/meanings-*.json, decks/cosmic-mysticism/*.webp, prototype/template.html
Запуск:    python3 tools/build_prototype.py
"""
import base64
import io
import json
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DECK = ROOT / "decks" / "cosmic-mysticism"
THUMB = (400, 600)

LABEL = re.compile(
    r"(Работа/карьера/бизнес|Работа и карьера|Работа"
    r"|Отношения/любовь|Отношения"
    r"|Личное/состояние/решения|Личное состояние|Состояние и решения|Состояние|Личное)\s*:"
)


def file_for(card_id: str) -> Path:
    if card_id.startswith("major-"):
        found = sorted(DECK.glob(card_id + "-*.webp"))
    else:
        found = [DECK / (card_id + ".webp")]
    if not found or not found[0].exists():
        sys.exit(f"нет картинки для {card_id}")
    return found[0]


def thumb(path: Path) -> str:
    im = Image.open(path).convert("RGB").resize(THUMB, Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=72, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


def split_practice(text: str, cid: str) -> dict:
    """practice -> {c: работа, l: отношения, s: состояние}. Заголовки в файлах разные."""
    marks = list(LABEL.finditer(text))
    out = {}
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(text)
        body = text[m.end():end].strip()
        key = "c" if m.group(1).startswith("Работа") else "l" if m.group(1).startswith("Отношения") else "s"
        if key in out:
            sys.exit(f"{cid}: повторный блок {m.group(1)}")
        out[key] = body[:1].upper() + body[1:]
    if set(out) != {"c", "l", "s"}:
        sys.exit(f"{cid}: найдены блоки {sorted(out)}")
    return out


def main():
    cards = []
    for name in ("meanings-major", "meanings-wands-cups", "meanings-swords-pentacles"):
        cards += json.loads((ROOT / "content" / f"{name}.json").read_text(encoding="utf-8"))
    order = {"major": 0, "wands": 1, "cups": 2, "swords": 3, "pentacles": 4}
    ranks = ["ace"] + [f"{n:02d}" for n in range(2, 11)] + ["page", "knight", "queen", "king"]

    def sort_key(c):
        tail = c["id"].split("-", 1)[1]
        return (order[c["arcana"]], int(tail) if c["arcana"] == "major" else ranks.index(tail))

    cards.sort(key=sort_key)

    live = set(json.loads((ROOT / "content" / "live.json").read_text(encoding="utf-8")))
    data = []
    for c in cards:
        item = {"id": c["id"], "n": c["name_ru"], "a": c["arcana"],
                "kw": c["keywords_ru"], "kr": c["keywords_reversed_ru"], "img": thumb(file_for(c["id"])), "f": file_for(c["id"]).name}
        if c["id"] in live:
            item["v"] = 1
        for pos, key in (("upright", "u"), ("reversed", "r")):
            d = c[pos]
            item[key] = {"e": d["essence"], "p": d["psychology"], **split_practice(d["practice"], c["id"])}
        data.append(item)
    if len(data) != 78:
        sys.exit(f"карт {len(data)}, а нужно 78")

    payload = {"cards": data, "back": thumb(DECK / "card-back.webp")}
    tpl = (ROOT / "prototype" / "template.html").read_text(encoding="utf-8")
    fragment = tpl.replace("__DATA__", json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    # Полноценная страница для открытия файла напрямую или через GitHub Pages
    head = ('<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            '<style>[hidden]{display:none!important}img{max-width:100%}body{margin:0}</style>\n')
    html = head + fragment.replace("</style>\n\n<div", "</style>\n</head>\n<body>\n<div", 1) + "\n</body>\n</html>\n"
    out = ROOT / "prototype" / "index.html"
    out.write_text(html, encoding="utf-8")
    print(f"{out.relative_to(ROOT)}: {len(html) / 1e6:.1f} МБ, карт {len(data)}")
    if len(sys.argv) > 2 and sys.argv[1] == "--artifact":  # заготовка для публикации как Artifact (без <html>/<head>)
        Path(sys.argv[2]).write_text(fragment, encoding="utf-8")
        print("artifact:", sys.argv[2])


if __name__ == "__main__":
    main()
