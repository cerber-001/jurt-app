#!/usr/bin/env python3
"""Переносит контент гида v2 (umra.jurt.kz, собранный index.html) в JSON-блоки v3.
Запуск: python3 tools/extract_v2.py [путь к index.html]
Выход: public/content/{steps,info,dua,zikr,modes,meta}.json и public/content/icons.svg.
Каждый блок имеет устойчивый id — на этом строится «конструктор» (паломник собирает гид из блоков)."""
import re, json, sys, html, datetime, pathlib

SRC = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/Users/chingismadiarov/umra-app/repo/index.html')
OUT = pathlib.Path(__file__).resolve().parent.parent / 'public' / 'content'
OUT.mkdir(parents=True, exist_ok=True)
H = SRC.read_text(encoding='utf-8')

CHEV = re.compile(r'<svg class="chev".*?</svg>', re.S)
CHK = re.compile(r'<span class="chk".*?</span>', re.S)
DONE = re.compile(r'\s*<button class="donebtn"></button>\s*')
MCHEV = re.compile(r'<svg class="mchev".*?</svg>', re.S)
WS = re.compile(r'\n\s*\n')

def text(s):
    return html.unescape(re.sub(r'<[^>]+>', '', s)).strip()

def clean(body):
    body = DONE.sub('', body)
    body = MCHEV.sub('', body)
    return WS.sub('\n', body).strip()

def inner(sec):
    """Тело аккордеона: содержимое <div class="acc-in">…</div> до закрытия секции."""
    m = re.search(r'<div class="acc-in">(.*)</div></div></div>\s*</section>', sec, re.S)
    return clean(m.group(1)) if m else ''

def duas(body):
    out = []
    for d in re.finditer(r'<div class="dua">((?:\s*<div class="[^"]*"[^>]*>.*?</div>)+)\s*</div>', body, re.S):
        blk = d.group(1)
        g = lambda c: (lambda m: text(m.group(1)) if m else '')(re.search(r'<div class="%s[^"]*">(.*?)</div>' % c, blk, re.S))
        out.append({k: v for k, v in dict(label=g('lbl'), ar=g('ar'), tr=g('tr'), ru=g('ru'), src=g('src')).items() if v})
    return out

def kicker(hdr):
    m = re.search(r'<div class="kicker">(.*?)</div>', hdr, re.S)
    if not m: return None
    k = m.group(1)
    nm = re.search(r'<span class="not-mecca">(.*?)</span>', k, re.S)
    om = re.search(r'<span class="only-mecca">(.*?)</span>', k, re.S)
    if nm or om:
        tail = text(re.sub(r'<span class="(not|only)-mecca">.*?</span>', '', k, flags=re.S))
        return {'first': (text(nm.group(1)) + (' ' + tail if tail else '')).strip() if nm else None,
                'mecca': (text(om.group(1)) + (' ' + tail if tail else '')).strip() if om else None}
    return {'first': text(k), 'mecca': text(k)}

def tags(body):
    return [{'kind': m.group(1), 'text': text(m.group(2))}
            for m in re.finditer(r'<span class="tag ([a-z]+)">(.*?)</span>', body, re.S)]

def sections(cls):
    out = re.findall(r'(<section class="%s"[^>]*>.*?</div></div></div>\s*</section>)' % cls, H, re.S)
    return [x for x in out if "'+esc(" not in x and "'+(" not in x]

# ---- шаги умры -------------------------------------------------------------
steps = []
for i, sec in enumerate(sections('acc step'), 1):
    hdr = re.search(r'<div class="acc-h">(.*?)<div class="acc-b">', sec, re.S).group(1)
    body = inner(sec)
    steps.append({
        'id': re.search(r'data-id="([^"]+)"', sec).group(1),
        'num': i,
        'icon': re.search(r'href="#([^"]+)"', hdr).group(1),
        'kicker': kicker(hdr),
        'title': text(re.search(r'<b>(.*?)</b>', hdr, re.S).group(1)),
        'tags': tags(body),
        'lead': text((re.search(r'<p class="lead">(.*?)</p>', body, re.S) or [None, ''])[1]) if '<p class="lead">' in body else '',
        'dua': duas(body),
        'html': body,
    })

# ---- информационные блоки --------------------------------------------------
info = []
for sec in sections('acc info(?: blue)?'):
    hdr = re.search(r'<div class="acc-h">(.*?)<div class="acc-b">', sec, re.S).group(1)
    title = text(re.search(r'<b>(.*?)</b>', hdr, re.S).group(1))
    info.append({
        'id': {'Как пользоваться гидом': 'howto', 'Запреты ихрама': 'ihram-bans'}.get(title, 'info-%d' % (len(info) + 1)),
        'icon': (re.search(r'href="#([^"]+)"', hdr) or [None, None])[1],
        'kicker': text((re.search(r'<div class="kicker">(.*?)</div>', hdr, re.S) or [None, ''])[1]),
        'title': title,
        'html': inner(sec),
    })

# ---- дуа -----------------------------------------------------------------------
DUA_IDS = [('Намерение', 'niyya'), ('Тальбия', 'talbiya'), ('Вход в мечеть', 'enter'), ('Чёрного камня', 'hajar'),
           ('Йеменским', 'rukn-yamani'), ('Макама', 'maqam'), ('Замзам', 'zamzam'), ('Подходя к Сафе', 'safa-approach'),
           ('На Сафе и на Марве', 'safa-marwa'), ('зелёными', 'green-lights'), ('Бритьё', 'halq'),
           ('Салям Пророку', 'salam-prophet'), ('Абу Бакру', 'salam-companions'), ('обитателям могил', 'salam-graves'),
           ('транспорт', 'transport'), ('Выход из мечети', 'exit')]
dua, seen = [], set()
for sec in sections('acc dq'):
    hdr = re.search(r'<div class="acc-h">(.*?)<div class="acc-b">', sec, re.S).group(1)
    title = text(re.search(r'<b>(.*?)</b>', hdr, re.S).group(1))
    did = next((v for k, v in DUA_IDS if k in title), None) or 'dua-%d' % (len(dua) + 1)
    assert did not in seen, did
    seen.add(did)
    body = inner(sec)
    d = {'id': did, 'icon': re.search(r'href="#([^"]+)"', hdr).group(1), 'title': title,
         'preview': text((re.search(r'<span class="pv">(.*?)</span>', hdr, re.S) or [None, ''])[1]),
         'items': duas(body), 'html': body}
    dua.append(d)

# ---- зикры: массив ZK как есть ----------------------------------------------------
zk_line = next(l for l in H.splitlines() if l.startswith('var ZK='))
zikr = json.loads(zk_line[len('var ZK='):].rstrip(';'))

# ---- режимы умры и бадаль (блок «Ваша умра») --------------------------------------
mq = re.search(r'<div class="modeq">(.*?)</div>\s*<a class="mygo h3d"', H, re.S).group(1)
modes = {
    'kinds': [{'id': m.group(1), 'title': text(m.group(2)), 'hint': text(m.group(3))}
              for m in re.finditer(r'data-kind="([a-z]+)">(.*?)<small>(.*?)</small>', mq, re.S)],
    'details': [{'id': ['what-changes', 'badal'][i], 'title': text(m.group(1)), 'html': clean(m.group(2))}
                for i, m in enumerate(re.finditer(r'<details><summary>(.*?)</summary>(.*?)</details>', mq, re.S))],
}

# ---- иконки: только используемые в контенте символы ---------------------------------
used = set(re.findall(r'href="#([a-z0-9-]+)"', json.dumps(steps + info + dua, ensure_ascii=False) + json.dumps(modes, ensure_ascii=False)))
used |= {s['icon'] for s in steps} | {d['icon'] for d in dua} | {i['icon'] for i in info if i['icon']}
syms = {m.group(1): m.group(0) for m in re.finditer(r'<symbol id="([^"]+)".*?</symbol>', H, re.S)}
missing = sorted(used - set(syms))
sprite = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n' + '\n'.join(syms[i] for i in sorted(used & set(syms))) + '\n</svg>\n'

# ---- hotels (для «Я потерялся») ---------------------------------------------------------
hotels = {}
for m in re.finditer(r"'(Медина|Мекка)':\{en:'([^']*)',name:'([^']*)',card:'([^']*)',q:'([^']*)'", H):
    hotels[m.group(1)] = {'en': m.group(2), 'name': m.group(3), 'card': m.group(4), 'q': m.group(5)}

ver = (re.search(r'v(\d+\.\d+)', re.search(r'<!--\s*v[\d.]+.*?-->|APP_VER\s*=\s*[\'"]v?([\d.]+)', H).group(0)) if re.search(r'APP_VER\s*=', H) else None)
meta = {
    'source': 'umra.jurt.kz index.html',
    'extracted': datetime.date.today().isoformat(),
    'madhhab': 'ханафитский',
    'anonymized': True,
    'counts': {'steps': len(steps), 'info': len(info), 'dua': len(dua), 'zikr': len(zikr)},
    'hotels': hotels,
    'notes': ['Даты в кикерах (01.11, 31.10) — для UMRA-0009; в этапе 1 подставлять из данных группы.',
              'Тексты дуа и переводы — на сверке у знатока ханафитского фикха (как в v2).'],
}

for name, obj in [('steps', steps), ('info', info), ('dua', dua), ('zikr', zikr), ('modes', modes), ('meta', meta)]:
    (OUT / f'{name}.json').write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding='utf-8')
(OUT / 'icons.svg').write_text(sprite, encoding='utf-8')
print('steps', len(steps), [s['id'] for s in steps])
print('info', [i['id'] for i in info])
print('dua', len(dua), [d['id'] for d in dua])
print('zikr', len(zikr), [z['id'] for z in zikr])
print('modes', [k['id'] for k in modes['kinds']], [d['id'] for d in modes['details']])
print('icons', len(used & set(syms)), 'missing:', missing)
print('personal names in output:', sum(json.dumps(x, ensure_ascii=False).count(w) for x in (steps, info, dua, zikr, modes) for w in ('Даурен', 'Мансур', 'Кубжанов')))
