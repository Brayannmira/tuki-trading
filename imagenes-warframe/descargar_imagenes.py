"""
Descarga las imagenes de todos los Warframes y armas (primarias,
secundarias y melee) desde la API publica de warframestat.us.
Uso:  python descargar_imagenes.py
Las imagenes quedan en las carpetas Warframe, primarias, secundarias y Melee.
"""
import json, os, re, urllib.request

BASE = os.path.dirname(os.path.abspath(__file__))
CDN = "https://cdn.warframestat.us/img/"
HEADERS = {"User-Agent": "Mozilla/5.0"}

def get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    return urllib.request.urlopen(req, timeout=30).read()

def limpio(nombre):
    return re.sub(r'[\\/:*?"<>|]', "", nombre).strip()

def guardar(items, carpeta):
    destino = os.path.join(BASE, carpeta)
    os.makedirs(destino, exist_ok=True)
    ok = 0
    for it in items:
        img = it.get("imageName")
        if not img:
            continue
        ext = os.path.splitext(img)[1] or ".png"
        ruta = os.path.join(destino, limpio(it["name"]) + ext)
        if os.path.exists(ruta):
            continue
        try:
            with open(ruta, "wb") as f:
                f.write(get(CDN + img))
            ok += 1
            print(f"[{carpeta}] {it['name']}")
        except Exception as e:
            print(f"  fallo {it['name']}: {e}")
    print(f"== {carpeta}: {ok} imagenes nuevas ==")

warframes = json.loads(get("https://api.warframestat.us/warframes"))
armas = json.loads(get("https://api.warframestat.us/weapons"))

guardar(warframes, "Warframe")
guardar([a for a in armas if a.get("category") == "Primary"], "primarias")
guardar([a for a in armas if a.get("category") == "Secondary"], "secundarias")
guardar([a for a in armas if a.get("category") == "Melee"], "Melee")
