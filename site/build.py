"""MRO Mogul site generator. Netlify runs this on every deploy:  python3 site/build.py
Reads:  data/products.csv      sizes, part numbers and prices (private: never published)
        data/product-info.csv  one row per product: name, brand, category, descriptions, features, photo
        data/site.json         categories, brands, home page picks, company details
        images/products/       product photos
Writes: public/                the website
"""
import json, os, re, shutil, html, csv, sys, datetime
try:
    from PIL import Image, ImageFilter, ImageOps
except Exception:
    Image = None

ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__))); SRC=os.path.join(ROOT,'site'); OUT=os.path.join(ROOT,'public')
SITE=json.load(open(os.path.join(ROOT,'data/site.json'),encoding='utf-8'))
CONFIG=SITE['company']; DOMAIN=CONFIG.get('domain','https://mromogul.com').rstrip('/')
TODAY=datetime.date.today().isoformat()
E=lambda x: html.escape(str(x), quote=True)
slug=lambda s: re.sub(r'[^a-z0-9]+','-',s.lower()).strip('-')
def readcsv(p):
    with open(p,encoding='utf-8-sig',newline='') as fh:
        return [{(k or '').strip().lower().replace(' ','_'):(v or '').strip() for k,v in r.items()} for r in csv.DictReader(fh)]
def warn(m): print('WARNING:',m)

# ---------- catalogue from the data files ----------
PRICE_ROWS=[r for r in readcsv(os.path.join(ROOT,'data/products.csv')) if r.get('sku') and r.get('product_id') and not re.search('hidden',r.get('stock_status',''),re.I)]
INFO={r['product_id']:r for r in readcsv(os.path.join(ROOT,'data/product-info.csv')) if r.get('product_id')}
CATS=[(c['id'],c['name'],c.get('description','')) for c in SITE['categories']]
CATINFO={c['id']:c for c in SITE['categories']}
BRANDINFO={b['name']:b for b in SITE['brands']}
num=lambda v: float(re.sub(r'[^0-9.]','',str(v)) or 0)
byp={}
for r in PRICE_ROWS: byp.setdefault(r['product_id'],[]).append(r)
order_ids=sorted(byp, key=lambda i:(num(INFO.get(i,{}).get('display_order') or 99999), i))
F=[]
for pid in order_ids:
    rs=sorted(byp[pid],key=lambda r:num(r.get('sort_order') or 0)); i=INFO.get(pid,{}); r0=rs[0]
    if not i: warn(f'{pid}: no row in product-info.csv, using basic details from products.csv')
    cat=i.get('category') or r0.get('category') or 'other'
    if cat not in CATINFO:
        warn(f'{pid}: new category "{cat}" (add it to data/site.json for a description and buying guide)')
        nm=cat.replace('-',' ').title(); CATINFO[cat]={'id':cat,'name':nm,'description':f'{nm} for industrial maintenance and production.','guide_title':'How to choose','how_to_choose':'Choose by size, rating and the material you work with. Ask our team if you are unsure.','care':'Store clean and dry, and inspect before use.','applications':['Plant maintenance','Production lines','Workshops'],'faqs':[]}
        CATS.append((cat,nm,CATINFO[cat]['description']))
    brand=i.get('brand') or r0.get('brand') or 'Other'
    F.append({'id':pid,'name':i.get('name') or r0.get('product_name') or pid,'brand':brand,'cat':cat,
      'desc':i.get('short_description') or r0.get('description') or f"{r0.get('product_name','')} from {brand}.",
      'ov':i.get('overview',''),'feats':[x.strip() for x in (i.get('features') or '').split('|') if x.strip()] or [f"{len(rs)} sizes / options available"],
      'featured':(i.get('featured') or r0.get('featured','')).lower().startswith('y'),'gst':r0.get('gst_included','yes'),'hsn':r0.get('hsn',''),
      'imgsrc':i.get('image') or f'{pid}.jpg','vrows':rs})
CATS=[c for c in CATS if any(f['cat']==c[0] for f in F)]
CATNAME={c[0]:c[1] for c in CATS}; CATDESC={c[0]:c[2] for c in CATS}
OV={f['id']:f['ov'] for f in F}
APPS={c:CATINFO[c].get('applications',[]) for c in CATNAME}
GUIDE={c:(CATINFO[c].get('guide_title','How to choose'),CATINFO[c].get('how_to_choose',''),CATINFO[c].get('care','')) for c in CATNAME}
FAQ_CAT={c:[tuple(x) for x in CATINFO[c].get('faqs',[])] for c in CATNAME}
BRANDS=[b['name'] for b in SITE['brands'] if any(f['brand']==b['name'] for f in F)]+sorted({f['brand'] for f in F}-{b['name'] for b in SITE['brands']})
BRAND={b:(BRANDINFO.get(b,{}).get('headline') or f'{b} products', BRANDINFO.get(b,{}).get('intro') or f'Genuine {b} products for industrial maintenance and production, supplied from Chennai.') for b in BRANDS}
BRSUB={b:BRANDINFO.get(b,{}).get('tagline') or ', '.join(sorted({CATNAME[f['cat']] for f in F if f['brand']==b}))[:40] for b in BRANDS}
BSLUG={b:slug(b.replace('+','-and-')) for b in BRANDS}
ascii_=lambda s:s
PROD=lambda pid: f"/product/{pid}/"; CAT=lambda cid: f"/category/{cid}/"; BR=lambda b: f"/brand/{BSLUG[b]}/"
for f in F:
    for r in f['vrows']: r.setdefault('std_pack','1'); r['std_pack']=r.get('std_pack') or '1'

if os.path.exists(OUT): shutil.rmtree(OUT)
for d in ('/img/p','/assets'): os.makedirs(OUT+d,exist_ok=True)

# ---------- images: consistent square framing ----------
def frame(src,dst,S=600,fill=0.80):
    if Image is None: shutil.copy(src,dst); return
    im=Image.open(src); im=ImageOps.exif_transpose(im).convert('RGB')
    box=im.convert('L').point(lambda p:255 if p<236 else 0).getbbox()
    if box: im=im.crop((max(0,box[0]-2),max(0,box[1]-2),min(im.width,box[2]+2),min(im.height,box[3]+2)))
    w,h=im.size; k=S*fill/max(w,h); im=im.resize((max(1,round(w*k)),max(1,round(h*k))),Image.LANCZOS)
    if k>1: im=im.filter(ImageFilter.UnsharpMask(radius=1.4,percent=70,threshold=3))
    c=Image.new('RGB',(S,S),'white'); c.paste(im,((S-im.width)//2,(S-im.height)//2)); c.save(dst,quality=88,optimize=True,progressive=True)
IMGDIR=os.path.join(ROOT,'images/products')
for f in F:
    cands=[f['imgsrc']]+[f['id']+e for e in ('.jpg','.jpeg','.png','.webp','.JPG','.PNG')]
    src=next((os.path.join(IMGDIR,c) for c in cands if os.path.isfile(os.path.join(IMGDIR,c))),None)
    if src:
        try: frame(src,f"{OUT}/img/p/{f['id']}.jpg"); continue
        except Exception as e: warn(f"{f['id']}: could not read image {src}: {e}")
    else: warn(f"{f['id']}: no photo in images/products/, showing a placeholder")
    shutil.copy(os.path.join(SRC,'static/img/placeholder.jpg'),f"{OUT}/img/p/{f['id']}.jpg")
for n in os.listdir(os.path.join(SRC,'static/img')): shutil.copy(os.path.join(SRC,'static/img',n),f'{OUT}/img/{n}')

# ---------- public catalogue (no prices) ----------
PUB=['sku','product_id','product_name','brand','category','variant','gst_included','gst_rate','min_order_qty','std_pack','stock_status','hsn','image','featured','sort_order','description']
pub=[]
for f in F:
    for r in f['vrows']:
        o={k:r.get(k,'') for k in PUB}; o.update(product_name=f['name'],brand=f['brand'],category=f['cat'],image=f"/img/p/{f['id']}.jpg"); pub.append(o)
open(OUT+'/assets/catalog-data.js','w').write('window.__CAT='+json.dumps(pub)+';')
rows=pub

# ---------- assets ----------
open(OUT+'/assets/style.css','w').write(open(os.path.join(SRC,'assets/style.css')).read())
js=open(os.path.join(SRC,'assets/app.src.js')).read().replace('__STATIC__',json.dumps({f['id']:1 for f in F})).replace('__CATS__',json.dumps(CATNAME))
open(OUT+'/assets/app.js','w').write(js)

# ---------- shell ----------
MARK='''<svg viewBox="0 0 40 44" aria-hidden="true"><path d="M20 1.5 38 11.75v20.5L20 42.5 2 32.25v-20.5Z" fill="#121B25"/><path d="M20 5.2 34.8 13.6v16.8L20 38.8 5.2 30.4V13.6Z" fill="none" stroke="#D9A21B" stroke-width="1.6"/><path d="M11.5 29V15.5h3.2l5.3 7.2 5.3-7.2h3.2V29h-3.4v-8.1l-5.1 6.8-5.1-6.8V29Z" fill="#fff"/></svg>'''
def brandmark(): return f'<a class="brand" href="/" aria-label="MRO Mogul home">{MARK}<span class="wm"><b>MRO<span>MOGUL</span></b><small>Industrial &amp; Automation Supplies</small></span></a>'
ICONS={
 'arrow':'<path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
 'menu':'<path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
 'cart':'<path d="M3 4h2.5l2.2 10.5a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.4-1.1L21 8H6.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="20" r="1.5" fill="currentColor"/><circle cx="17" cy="20" r="1.5" fill="currentColor"/>',
 'wa':'<path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.5-2-1-1 .8c-1-.4-2.4-1.8-2.8-2.8l.8-1-1-2z" fill="currentColor"/>',
 'pdf':'<path d="M7 3h7l5 5v13H7z M14 3v5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M13 13v5M15 15.5l-2 2.5-2-2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
 'search':'<circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
 'shield':'<path d="M12 3l8 3v6c0 5-3.5 8.5-8 9.5C7.5 20.5 4 17 4 12V6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.5 12l2.5 2.5 4.5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
 'doc':'<path d="M6 3h8l4 4v14H6z M14 3v4h4 M9 12h6 M9 16h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
 'truck':'<path d="M2 6h12v10H2zM14 10h4l3 3.5V16h-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="6" cy="18" r="2" fill="#fff" stroke="currentColor" stroke-width="1.8"/><circle cx="17" cy="18" r="2" fill="#fff" stroke="currentColor" stroke-width="1.8"/>',
 'lock':'<rect x="5" y="10.5" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="2"/>',
 'user':'<circle cx="12" cy="8.5" r="3.8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4.5 20c1.2-3.8 4-5.5 7.5-5.5s6.3 1.7 7.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
 'phone':'<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
 'pin':'<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="9.5" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/>',
 'tag':'<path d="M3 12V4h8l10 10-8 8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="7.5" cy="8.5" r="1.5" fill="currentColor"/>',
 'chev':'<path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
}
SPRITE='<svg width="0" height="0" style="position:absolute" aria-hidden="true">'+''.join(f'<symbol id="i-{k}" viewBox="0 0 24 24">{v}</symbol>' for k,v in ICONS.items())+'</svg>'
ico=lambda n,c='': f'<svg class="{c}" aria-hidden="true"><use href="#i-{n}"/></svg>'

TOPBAR=f'''<div class="topbar"><div class="wrap"><span>A unit of <b>Accelfast Industrial Enterprises</b>, Chennai · Supplying industry since 2009</span><span class="tb-r"><a href="tel:+{CONFIG['phone_raw']}">{CONFIG['phone']}</a><a href="mailto:{CONFIG['email']}">{CONFIG['email']}</a><span>GST invoice on every order</span></span></div></div>'''
def dd(label,url,items,active):
    return (f'<div class="dd"><a href="{url}"{" aria-current=\"page\"" if active else ""}>{label}{ico("chev","chv")}</a><div class="dd-menu">'+''.join(f'<a href="{u}">{E(n)}<small>{E(s)}</small></a>' for n,u,s in items)+'</div></div>')
def header(active):
    brands=[(b,BR(b),f"{(k:=sum(1 for f in F if f['brand']==b))} product{'s' if k>1 else ''}") for b in BRANDS]
    cats=[(n,CAT(c),f"{sum(1 for f in F if f['cat']==c)} products") for c,n,_ in CATS]
    nav=(f'<a href="/"{" aria-current=\"page\"" if active=="/" else ""}>Home</a>'
         f'<a href="/products/"{" aria-current=\"page\"" if active=="/products/" else ""}>All Products</a>'
         +dd('Shop by Brand','/brands/',brands,active=='/brands/')+dd('Categories','/categories/',cats,active=='/categories/')+
         f'<a href="/about/"{" aria-current=\"page\"" if active=="/about/" else ""}>About Us</a><a href="/contact/"{" aria-current=\"page\"" if active=="/contact/" else ""}>Contact</a>')
    return f'''{TOPBAR}<header class="site-head"><div class="wrap head-in">{brandmark()}
    <form class="hsearch" action="/products/" data-to="/products/" role="search">{ico("search")}<input name="q" type="search" placeholder="Search products, brands or part numbers" aria-label="Search products"><button type="submit">Search</button></form>
    <div class="head-cta"><a class="acct" href="/account/">{ico("user")}<span>Sign in</span></a><a class="basket" href="/cart/" title="Cart and quotation">{ico("cart")}<span>Cart</span><b class="ccount">0</b></a></div>
    <button class="menu-btn" id="menuBtn" aria-controls="nav" aria-expanded="false" aria-label="Open menu">{ico("menu")}</button></div>
    <div class="navbar"><div class="wrap"><nav class="nav" id="nav" data-open="false" aria-label="Main">{nav}</nav><a class="nav-cta" href="/account/#register">{ico("tag")}Create a free trade account</a></div></div></header>'''
FOOT=f'''<section class="assure"><div class="wrap">
  <div>{ico("shield")}<b>Genuine branded products</b><span>Supplied with manufacturer warranty</span></div>
  <div>{ico("doc")}<b>GST invoice</b><span>Claim input tax credit on every order</span></div>
  <div>{ico("pdf")}<b>Official quotation</b><span>PDF from our accounting system, instantly</span></div>
  <div>{ico("truck")}<b>Dispatch from Chennai</b><span>Tamil Nadu, Karnataka, AP and Kerala</span></div>
</div></section>
<footer class="foot"><div class="wrap"><div class="foot-grid">
  <div style="display:grid;gap:14px;align-content:start">{brandmark()}<p>Industrial MRO and automation products for plants, workshops and OEMs across South India.</p><p class="parent">MRO Mogul is a unit of <a href="https://accelfast.in" style="color:#fff">Accelfast Industrial Enterprises</a>, 165 Broadway, Chennai – 600 108. Supplying industry since 2009.{(' GSTIN '+CONFIG['gstin']+'.') if CONFIG['gstin'] else ''}</p></div>
  <div><h4>Shop</h4><ul><li><a href="/products/">All products</a></li><li><a href="/brands/">Shop by brand</a></li>{''.join(f'<li><a href="{CAT(c)}">{E(n)}</a></li>' for c,n,_ in CATS[10:14])}<li><a href="/categories/">All categories</a></li></ul></div>
  <div><h4>Customers</h4><ul><li><a href="/account/">Sign in / create account</a></li><li><a href="/cart/">Cart &amp; quotation</a></li><li><a href="/contact/">Bulk &amp; project quotes</a></li><li><a href="/policies/">Shipping, returns &amp; privacy</a></li><li><a href="/about/#faq">FAQs</a></li></ul></div>
  <div><h4>Contact</h4><ul><li>165 Broadway, Chennai – 600 108</li><li><a href="tel:+{CONFIG['phone_raw']}">{CONFIG['phone']}</a></li><li><a href="mailto:{CONFIG['email']}">{CONFIG['email']}</a></li><li><a href="https://wa.me/{CONFIG['phone_raw']}" target="_blank" rel="noopener">WhatsApp us</a></li></ul></div>
</div><div class="foot-bottom"><span>© 2026 MRO Mogul · A unit of Accelfast Industrial Enterprises</span><span>Brand names and trademarks belong to their respective owners.</span></div></div></footer>
<a class="wa-float" href="https://wa.me/{CONFIG['phone_raw']}" target="_blank" rel="noopener" aria-label="Chat with us on WhatsApp">{ico("wa")}<span>Chat with us</span></a>'''
FONTS='<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Saira:wdth,wght@75..125,400..800&family=Public+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@500&display=swap">'
ORG={"@context":"https://schema.org","@type":"Store","@id":DOMAIN+"/#store","name":"MRO Mogul","url":DOMAIN+"/","logo":DOMAIN+"/img/apple-touch-icon.png","image":DOMAIN+"/img/og-image.jpg",
 "description":"Online store for industrial MRO and automation products: hand tools, pneumatic components, air tools, brass fittings and cutting tools for industries in South India.",
 "telephone":"+91-98840-64464","email":CONFIG['email'],"parentOrganization":{"@type":"Organization","name":"Accelfast Industrial Enterprises","url":"https://accelfast.in","foundingDate":"2009"},
 "address":{"@type":"PostalAddress","streetAddress":"165 Broadway","addressLocality":"Chennai","addressRegion":"Tamil Nadu","postalCode":"600108","addressCountry":"IN"},
 "areaServed":[{"@type":"State","name":n} for n in ["Tamil Nadu","Karnataka","Andhra Pradesh","Kerala"]],"brand":[{"@type":"Brand","name":b} for b in BRANDS]}
def page(title,desc,url,body,active='',ld=(),noindex=False,og='/img/og-image.jpg'):
    lds=''.join(f'<script type="application/ld+json">{json.dumps(x,ensure_ascii=False)}</script>\n' for x in [ORG,*ld])
    return f'''<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{E(title)}</title><meta name="description" content="{E(desc)}"><link rel="canonical" href="{DOMAIN}{url}">
<meta name="robots" content="{'noindex,follow' if noindex else 'index,follow,max-image-preview:large'}">
<meta property="og:type" content="website"><meta property="og:site_name" content="MRO Mogul"><meta property="og:title" content="{E(title)}"><meta property="og:description" content="{E(desc)}"><meta property="og:url" content="{DOMAIN}{url}"><meta property="og:image" content="{DOMAIN}{og}"><meta property="og:locale" content="en_IN"><meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#121B25"><meta name="geo.region" content="IN-TN"><meta name="geo.placename" content="Chennai"><link rel="icon" type="image/png" href="/img/favicon.png"><link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
{FONTS}<link rel="stylesheet" href="/assets/style.css">
{lds}</head>
<body>
{SPRITE}
{header(active)}
<main id="main">
{body}
</main>
{FOOT}
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script src="/assets/app.js" defer></script>
</body>
</html>
'''
def write(url,htm):
    p=OUT+url+('index.html' if url.endswith('/') else ''); os.makedirs(os.path.dirname(p),exist_ok=True); open(p,'w').write(htm)
def crumb_ld(items): return {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":i+1,"name":n,"item":DOMAIN+u} for i,(n,u) in enumerate(items)]}
def crumbs(items): return '<nav class="crumbs wrap" aria-label="Breadcrumb">'+' <span aria-hidden="true">/</span> '.join(f'<a href="{u}">{E(n)}</a>' if i<len(items)-1 else f'<span>{E(n)}</span>' for i,(n,u) in enumerate(items))+'</nav>'
def faq_ld(qs): return {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":a}} for q,a in qs]}
def faq_html(qs): return '<div class="faq">'+''.join(f'<details><summary>{E(q)}</summary><p>{E(a)}</p></details>' for q,a in qs)+'</div>'
LOCK=f'<span class="plock">{ico("lock")}Sign in for price</span>'
def card(f,i):
    n=len(f['vrows']); q=(f['name']+' '+f['brand']+' '+' '.join(r['variant']+' '+r['sku'] for r in f['vrows'])).lower()
    return (f'<a class="pcard" href="{PROD(f["id"])}" data-pid="{f["id"]}" data-brand="{E(f["brand"])}" data-cat="{f["cat"]}" data-i="{i}" data-q="{E(q)}">'+
      f'<div class="ph"><img src="/img/p/{f["id"]}.jpg" alt="{E(f["name"])}" loading="lazy" width="300" height="300"></div><div class="tx"><span class="brand">{E(f["brand"])}</span><h3>{E(f["name"])}</h3>'
      f'<div class="pfoot"><span class="price locked" data-pp="{f["id"]}">{LOCK}</span><span class="opts">{n} {"sizes" if n>1 else "option"}</span></div></div></a>')
cat_img=lambda cid: next((f for f in F if f['cat']==cid and f['featured']),[f for f in F if f['cat']==cid][0])['id']
ordered=lambda fs: [f for f in fs if f['featured']]+[f for f in fs if not f['featured']]
def listing(fs,scope='',val=''):
    brands=sorted(set(f['brand'] for f in fs)); cats=[c for c,_,_ in CATS if any(f['cat']==c for f in fs)]
    bl=''.join(f'<label><input type="checkbox" class="fbrand" value="{E(b)}"> {E(b)} <span class="n">{sum(1 for f in fs if f["brand"]==b)}</span></label>' for b in brands) if scope!='brand' else ''
    cl=''.join(f'<label><input type="checkbox" class="fcat" value="{c}"> {E(CATNAME[c])} <span class="n">{sum(1 for f in fs if f["cat"]==c)}</span></label>' for c in cats) if scope!='cat' else ''
    boxes=(f'<div class="fbox"><h3>Brand</h3><div class="flist">{bl}</div></div>' if bl else '')+(f'<div class="fbox"><h3>Category</h3><div class="flist">{cl}</div></div>' if cl else '')
    boxes+=f'<div class="fbox fhelp">{ico("lock")}<p><b>Prices are for registered customers.</b> Create a free account to see prices and download official quotations.</p><a class="btn btn-amber" href="/account/#register">Create account</a></div>'
    return f'''<div class="shop-layout"><aside class="filters" aria-label="Filters">{boxes}</aside>
<div><div class="list-tools"><div class="lt-search">{ico("search")}<input id="fq" type="search" placeholder="Filter by name, size or part number" aria-label="Filter products"></div><select id="fsort" aria-label="Sort"><option value="pop">Most in demand</option><option value="az">Name A–Z</option></select><span class="count" id="fcount">{len(fs)} products</span></div>
<div class="pgrid" id="pgrid" data-scope="{scope}" data-val="{E(val)}">{''.join(card(f,i) for i,f in enumerate(fs))}</div><div class="empty" id="fempty" hidden style="margin-top:14px">No products match. Try another search, or <a href="/contact/">ask us for a quote</a>.</div></div></div>'''
def page_head(eyebrow,title,lead,img=''):
    return f'<section class="phead"><div class="wrap"><span class="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{lead}</p>{img}</div></section>'

# ---------- shared trust content ----------
HOME_FAQ=[
 ("Why do I need an account to see prices?","Prices on MRO Mogul are trade prices for businesses. A free account lets us show the right price for you as an end user or a reseller, and lets you download official GST quotations in your company's name."),
 ("Is the quotation official?","Yes. Quotations are created in our accounting system (Zoho Books) under your registered company details, with HSN codes and GST, and downloaded as a PDF you can attach to a purchase requisition."),
 ("How do I pay?","After you place an order request we confirm stock and freight, then send a proforma invoice. Payment is by bank transfer (NEFT/RTGS/IMPS) or UPI to Accelfast Industrial Enterprises. Credit terms are available for approved business accounts."),
 ("Do you give a GST invoice?","Yes. Every order is billed with a GST tax invoice so registered businesses can claim input tax credit."),
 ("Where do you deliver and how fast?","We dispatch from Chennai across Tamil Nadu, Karnataka, Andhra Pradesh and Kerala. Stock items typically reach Chennai customers in 1–3 working days and the rest of South India in 3–7 working days."),
 ("Are the products genuine?","We supply genuine branded products sourced through the brands' trade channels, with the manufacturer's warranty."),
 ("I am a reseller. Do you offer dealer pricing?","Yes. Select 'Reseller' when you create your account and our team will set up the right price list for you."),
]
WHY=[("shield","Genuine brands, real warranty","Stanley, Taparia, Techno, Airic and Totem products sourced through trade channels, with the manufacturer's warranty."),
 ("pdf","Official quotations, instantly","Your quotation is created in our accounting system in your company's name, with GST and HSN, ready for approval."),
 ("doc","GST invoice and input credit","Every order is billed with a proper GST tax invoice from a registered Chennai business."),
 ("lock","Your account, your prices","Separate pricing for end users and resellers. Your details stay private and are used only for your orders."),
 ("truck","Dispatch from Chennai","Delivered by courier, transport or our own vehicle across South India, with tracking shared on WhatsApp."),
 ("phone","Real people to talk to","Call or WhatsApp our sales team for sizes, alternatives and bulk pricing. No bots.")]
def why_html(): return '<div class="why">'+''.join(f'<div>{ico(i)}<b>{E(t)}</b><p>{E(d)}</p></div>' for i,t,d in WHY)+'</div>'
WHO=f'''<div class="who"><div class="who-l"><span class="eyebrow">Who you are buying from</span><h2>MRO Mogul is run by Accelfast Industrial Enterprises</h2>
<p>Accelfast has supplied maintenance, repair and operations products to plants across South India since 2009, from its office at 165 Broadway, Chennai, the city's traditional hub for industrial trade. MRO Mogul is our online store: the same team, the same supply relationships, now with online ordering and instant quotations.</p>
<div class="who-actions"><a class="btn btn-blue" href="/about/">About us</a><a class="btn btn-ghost" href="https://accelfast.in" target="_blank" rel="noopener">Visit accelfast.in</a></div></div>
<dl class="who-card"><div><dt>Business</dt><dd>Accelfast Industrial Enterprises</dd></div><div><dt>Established</dt><dd>2009</dd></div><div><dt>Address</dt><dd>165 Broadway, Chennai – 600 108, Tamil Nadu<br><a href="https://www.google.com/maps/search/?api=1&amp;query=165+Broadway+Chennai+600108" target="_blank" rel="noopener">View on Google Maps</a></dd></div>
{f'<div><dt>GSTIN</dt><dd>{CONFIG["gstin"]}</dd></div>' if CONFIG['gstin'] else ''}<div><dt>Phone / WhatsApp</dt><dd><a href="tel:+{CONFIG['phone_raw']}">{CONFIG['phone']}</a></dd></div><div><dt>Email</dt><dd><a href="mailto:{CONFIG['email']}">{CONFIG['email']}</a></dd></div><div><dt>Serving</dt><dd>Tamil Nadu · Karnataka · Andhra Pradesh · Kerala</dd></div></dl></div>'''

# ---------- home ----------
FIND=lambda i: next(f for f in F if f['id']==i)
IDS={f['id'] for f in F}
pop=[FIND(i) for i in SITE.get('home_popular',[]) if i in IDS] or [f for f in F if f['featured']][:10]
SHOW=[tuple(x) for x in SITE.get('home_showcase',[]) if x[0] in IDS and x[2] in CATNAME][:6]
show=''.join(f'<a class="sh-t sh-{k}" href="{CAT(c)}"><img src="/img/p/{i}.jpg" alt="{E(n)}" width="300" height="300"><span>{E(n)}</span></a>' for k,(i,n,c) in enumerate(SHOW))
nsku=len(rows)
cats_home=''.join(f'<a class="ctile" href="{CAT(cid)}"><span class="ci"><img src="/img/p/{cat_img(cid)}.jpg" alt="" loading="lazy" width="160" height="160"></span><b>{E(cn)}</b><small>{sum(1 for f in F if f["cat"]==cid)} products</small></a>' for cid,cn,_ in CATS)
INDS=['Automotive & auto components','Renewable energy','Power generation','Fabrication & structural','Assembly lines','Pharmaceuticals','Electronics manufacturing','Maintenance workshops']
body=f'''<section class="hero2"><div class="wrap">
  <div class="h-copy">
    <span class="h-kicker">Industrial &amp; automation supplies · South India</span>
    <h1>Industrial tools and pneumatics, <em>bought the professional way.</em></h1>
    <p>Genuine Stanley, Taparia, Techno, Airic and Totem products with part numbers, HSN codes and trade pricing. Create a free account to see your prices and download an official GST quotation in seconds.</p>
    <form class="h-search" action="/products/" data-to="/products/" role="search">{ico("search")}<input name="q" type="search" placeholder="Try “solenoid valve”, “PU tube 8 mm” or “M10 tap”" aria-label="Search products"><button class="btn btn-amber" type="submit">Search</button></form>
    <div class="h-cta"><a class="btn btn-amber" href="/account/#register">Create a free trade account</a><a class="lnk-w" href="/account/">Already registered? Sign in →</a></div>
  </div>
  <div class="h-show" aria-label="Featured categories">{show}</div>
</div>
<div class="h-stats"><div class="wrap"><div><b>Since 2009</b><span>Supplying South Indian industry</span></div><div><b>{nsku}</b><span>Sizes and part numbers online</span></div><div><b>GST invoice</b><span>On every order</span></div><div><b>4 states</b><span>TN · KA · AP · Kerala</span></div></div></div></section>
<section class="brands"><div class="wrap"><span>Brands we supply</span>{''.join(f'<a class="bm" href="{BR(b)}"><b>{E(b)}</b><small>{E(BRSUB[b])}</small></a>' for b in BRANDS)}</div></section>
<section class="band"><div class="wrap"><div class="sh-row"><div><span class="eyebrow">Shop by category</span><h2>Everything for the shop floor</h2></div><a class="lnk" href="/categories/">View all categories →</a></div><div class="cgrid">{cats_home}</div></div></section>
<section class="band paper"><div class="wrap"><div class="sh-row"><div><span class="eyebrow">Most in demand</span><h2>What plants reorder most</h2></div><a class="lnk" href="/products/">Browse all {len(F)} products →</a></div>
<div class="pgrid pgrid-5">{''.join(card(f,i) for i,f in enumerate(pop))}</div></div></section>
<section class="band"><div class="wrap"><div class="sh-row"><div><span class="eyebrow">Why MRO Mogul</span><h2>Buy with confidence</h2></div></div>{why_html()}</div></section>
<section class="band paper"><div class="wrap">{WHO}</div></section>
<section class="band"><div class="wrap how"><div class="how-l"><span class="eyebrow">How ordering works</span><h2>From account to approved quotation in minutes</h2><p class="lead">Purchase teams need a formal quotation before raising a PO. MRO Mogul gives you one instantly, in your company's name, with GST worked out.</p><a class="btn btn-blue" href="/account/#register">Create your account</a></div>
<ol class="steps2"><li><b>Create a free account</b><span>Your company, GSTIN and whether you are an end user or reseller. It takes a minute.</span></li><li><b>Add sizes to your cart</b><span>See your prices on every size and part number.</span></li><li><b>Download the official PDF quote</b><span>Generated by our accounting system in your company's name, with HSN and GST.</span></li><li><b>Confirm and receive</b><span>Place the order online or on WhatsApp. We send a proforma invoice and dispatch from Chennai.</span></li></ol></div></section>
<section class="band dark on-dark inds"><div class="wrap"><div class="inds-l"><span class="eyebrow">Industries served</span><h2 style="color:#fff">Trusted by maintenance teams across South India</h2><p>From automotive plants in Sriperumbudur and Hosur to wind farms, pharma units and fabrication shops, our customers rely on us for the everyday items that keep production running.</p></div><ul>{''.join(f'<li>{E(x)}</li>' for x in INDS)}</ul></div></section>
<section class="band" id="faq"><div class="wrap faq-wrap"><div><span class="eyebrow">Questions</span><h2>Frequently asked questions</h2><p class="lead" style="margin-top:10px">Can't find your answer? Call <a href="tel:+{CONFIG['phone_raw']}">{CONFIG['phone']}</a> or WhatsApp us.</p></div>{faq_html(HOME_FAQ)}</div></section>
<section class="cta2"><div class="wrap"><div><h2>Have an indent or a full BOQ?</h2><p>Send the list. We quote the best available price, pack size and delivery date, usually the same day.</p></div><div class="cta2-b"><a class="btn btn-amber" href="/contact/">Request bulk quote</a><a class="btn btn-ghost" href="https://wa.me/{CONFIG['phone_raw']}" target="_blank" rel="noopener">{ico("wa")}WhatsApp us</a></div></div></section>'''
write('/',page("MRO Mogul | Industrial Tools, Pneumatics & MRO Supplies – Chennai, South India",
  "Buy genuine Stanley & Taparia hand tools, Techno solenoid valves, FRLs, cylinders, push-in fittings, air tools, Airic brass fittings and Totem taps. Trade pricing, GST invoice, official quotes. Chennai.",
  '/',body,active='/',ld=[{"@context":"https://schema.org","@type":"WebSite","name":"MRO Mogul","url":DOMAIN+"/","potentialAction":{"@type":"SearchAction","target":DOMAIN+"/products/?q={search_term_string}","query-input":"required name=search_term_string"}},faq_ld(HOME_FAQ)]))

# ---------- all products ----------
write('/products/',page("All Products – Industrial Tools, Pneumatics & Fittings | MRO Mogul",f"Browse {len(F)} industrial products and {nsku} sizes from Stanley, Taparia, Techno, Airic and Totem. Filter by brand and category, sign in for prices and official quotes.",
  '/products/',crumbs([("Home","/"),("All products","/products/")])+page_head("Full catalogue","All products",f"{len(F)} products and {nsku} sizes from six brands. Filter by brand or category, or search by part number.")+f'<section class="band tight"><div class="wrap">{listing(ordered(F))}</div></section>',active='/products/'))

# ---------- brands ----------
bcards=''.join(f'<a class="brand-card" href="{BR(b)}"><span class="bc-imgs">'+''.join(f'<img src="/img/p/{f["id"]}.jpg" alt="" loading="lazy">' for f in [x for x in ordered([g for g in F if g['brand']==b])][:3])+f'</span><b>{E(b)}</b><span>{E(BRAND[b][1][:150].rsplit(" ",1)[0])}…</span><small>{sum(1 for f in F if f["brand"]==b)} products →</small></a>' for b in BRANDS)
write('/brands/',page("Shop by Brand – Stanley, Taparia, Techno, Airic, Totem | MRO Mogul","Shop industrial tools and pneumatics by brand: Stanley, Taparia, Techno, Airic, Totem and Black+Decker. Genuine products, GST invoice, dispatch from Chennai.",
  '/brands/',crumbs([("Home","/"),("Brands","/brands/")])+page_head("Shop by brand","Brands we supply","Genuine products from established tool and pneumatics brands, sourced through trade channels.")+f'<section class="band tight"><div class="wrap"><div class="brand-grid">{bcards}</div></div></section>',active='/brands/'))
for b in BRANDS:
    fs=ordered([f for f in F if f['brand']==b]); h,intro=BRAND[b]
    cats=sorted(set(CATNAME[f['cat']] for f in fs))
    lead=f"{intro}"
    body=crumbs([("Home","/"),("Brands","/brands/"),(b,BR(b))])+page_head(f"{len(fs)} products · {E(', '.join(cats[:4]))}",E(h),E(lead))+f'<section class="band tight"><div class="wrap">{listing(fs,"brand",b)}</div></section>'
    write(BR(b),page(f"{b} Dealer in Chennai – Buy {b} {'Tools' if b in ('Stanley','Taparia','Black+Decker') else 'Products'} Online | MRO Mogul",
      f"Genuine {b} products from a Chennai supplier: {', '.join(cats[:5])}. Trade pricing for end users and resellers, GST invoice, official PDF quotes, delivery across South India.",
      BR(b),body,active='/brands/',ld=[crumb_ld([("Home","/"),("Brands","/brands/"),(b,BR(b))]),{"@context":"https://schema.org","@type":"CollectionPage","name":h,"about":{"@type":"Brand","name":b}}]))

# ---------- categories ----------
cards=''.join(f'<a class="cat-card" href="{CAT(cid)}"><span class="ci"><img src="/img/p/{cat_img(cid)}.jpg" alt="" loading="lazy"></span><div><small>{sum(1 for f in F if f["cat"]==cid)} products · {E(", ".join(sorted(set(f["brand"] for f in F if f["cat"]==cid))))}</small><b>{E(cn)}</b><span>{E(cd)}</span></div></a>' for cid,cn,cd in CATS)
write('/categories/',page("All Categories | MRO Mogul","Browse all MRO Mogul categories: spanners, pliers, screwdrivers, sockets, hex keys, hammers, measuring, cutting, storage, workshop, pneumatics, air tools, brass fittings, taps and drills.",
  '/categories/',crumbs([("Home","/"),("Categories","/categories/")])+page_head("Browse","All categories","Hand tools, pneumatics, air tools, fittings and cutting tools, grouped the way maintenance teams buy them.")+f'<section class="band tight"><div class="wrap"><div class="cat-cards">{cards}</div></div></section>',active='/categories/'))
for cid,cn,cd in CATS:
    fs=ordered([f for f in F if f['cat']==cid]); brands=', '.join(sorted(set(f['brand'] for f in fs)))
    g=GUIDE[cid]; cq=[(f"How do I choose the right {cn.lower()}?",g[1]),(f"How should I look after {cn.lower()}?",g[2])]+FAQ_CAT.get(cid,[])
    extra=f'<section class="band tight paper"><div class="wrap guide"><div><span class="eyebrow">Buying guide</span><h2>{E(g[0])}: {E(cn.lower())}</h2><p>{E(g[1])}</p><h3>Care and safety</h3><p>{E(g[2])}</p><h3>Typical applications</h3><ul class="pd-feats">{"".join(f"<li>{E(a)}</li>" for a in APPS[cid])}</ul></div>{faq_html(cq)}</div></section>'
    body=crumbs([("Home","/"),("Categories","/categories/"),(cn,CAT(cid))])+page_head(E(brands),E(cn),f"{E(cd)} Sign in for trade prices and official GST quotations.",f'<span class="ph-img"><img src="/img/p/{cat_img(cid)}.jpg" alt=""></span>')+f'<section class="band tight"><div class="wrap">{listing(fs,"cat",cid)}</div></section>'+extra
    write(CAT(cid),page(f"{cn} – {brands} | Buy Online in Chennai | MRO Mogul",f"Buy {cn.lower()} from {brands}. {cd} Trade pricing, GST invoice, official PDF quotes, dispatch from Chennai across South India.",CAT(cid),body,active='/categories/',ld=[crumb_ld([("Home","/"),("Categories","/categories/"),(cn,CAT(cid))]),faq_ld(cq)]))

# ---------- product pages ----------
STD_RE=re.compile(r'\b(IS \d[\d\s\(\)IVX\-]*|DIN \d+|BS \d+|ISO \d+)',re.I)
def specs(f):
    v=[r['variant'] for r in f['vrows']]; n=len(v)
    std=sorted(set(m.group(0).strip() for t in f['feats']+[f['desc']] for m in STD_RE.finditer(t)))
    mat=[x for x in f['feats'] if re.search(r'steel|vanadium|brass|aluminium|plated|finish|coating|PU|polyurethane|nylon|forged|HSS|carbide|fibreglass|rubber',x,re.I)]
    s=[("Brand",f['brand']),("Product type",CATNAME[f['cat']]),("Sizes / options available",str(n)),("Range",v[0] if n==1 else f"{v[0]} to {v[-1]}"),
       ("Part numbers",f"{f['vrows'][0]['sku']}" if n==1 else f"{f['vrows'][0]['sku']} … {f['vrows'][-1]['sku']}")]
    if std: s.append(("Standard",", ".join(std)))
    if mat: s.append(("Construction",", ".join(mat)))
    s+= [("HSN code",f.get('hsn') or "—"),("GST rate","18%"),("Price basis","Includes GST (MRP)" if f['gst']=='yes' else "GST extra"),("Standard pack",f"{f['vrows'][0]['std_pack']} pcs")]
    for x in f['feats']:
        if x not in mat and not STD_RE.search(x): s.append(("Feature",x))
    return s
def pfaq(f):
    v=[r['variant'] for r in f['vrows']]; short=re.sub(r'\s*\(.*?\)','',f['name'])
    vs=", ".join(v[:12])+(f" and {len(v)-12} more" if len(v)>12 else "")
    q=[(f"What sizes of {short} are available?",f"MRO Mogul lists {len(v)} {'sizes/options' if len(v)>1 else 'option'}: {vs}. Each has its own part number shown in the table above."),
       (f"What is the HSN code and GST rate for {short}?",f"The HSN code is {f.get('hsn') or 'confirmed on the invoice'} and GST is charged at 18%. {'Prices shown include GST.' if f['gst']=='yes' else 'Prices are shown before GST.'}"),
       (f"How do I get the price and an official quotation for {short}?","Create a free MRO Mogul account to see your price. Add the sizes you need to the cart and click “Download Official PDF quote instantly” to get a GST quotation in your company's name."),
       (f"Can I buy {short} in bulk or as a reseller?","Yes. Register as a reseller to receive dealer pricing, or send your quantity through the bulk quote form for project pricing and delivery dates.")]
    return q+FAQ_CAT.get(f['cat'],[])[:1]
def vrow(r): return (f'<tr data-sku="{E(r["sku"])}"><td>{E(r["variant"])}</td><td class="sku">{E(r["sku"])}</td><td class="pr">{LOCK}</td><td class="stk"><span class="stock in">In stock</span></td>'
    '<td><span class="qty"><button type="button" data-d="-" aria-label="Decrease">−</button><input type="number" inputmode="numeric" min="1" value="1" aria-label="Quantity"><button type="button" data-d="+" aria-label="Increase">+</button></span></td>'
    f'<td><button type="button" class="addc">{ico("cart")}Add</button></td></tr>')
for f in F:
    cn=CATNAME[f['cat']]; n=len(f['vrows']); url=PROD(f['id']); g=GUIDE[f['cat']]
    rel=sorted([x for x in F if x['cat']==f['cat'] and x['id']!=f['id']],key=lambda x:(x['brand']!=f['brand'],not x['featured']))[:5]
    sp=specs(f); fq=pfaq(f); ov=OV.get(f['id'],'')
    body=f'''{crumbs([("Home","/"),(f['brand'],BR(f['brand'])),(cn,CAT(f['cat'])),(f['name'],url)])}
<section class="band tight" style="padding-top:18px"><div class="wrap"><div class="pd">
  <div class="pd-img"><img src="/img/p/{f['id']}.jpg" alt="{E(f['name'])}" width="600" height="600"></div>
  <div class="pd-info">
    <div class="pd-brand"><a href="{BR(f['brand'])}"><b>{E(f['brand'])}</b></a><a href="{CAT(f['cat'])}" style="color:inherit">{E(cn)}</a></div>
    <h1>{E(f['name'])}</h1>
    <div class="pd-ids"><span>{n} {"sizes" if n>1 else "option"}</span><span>Part no. {E(f['vrows'][0]['sku'])}{" …" if n>1 else ""}</span><span>HSN {E(f.get('hsn') or '—')}</span></div>
    <p class="pd-lead">{E(f['desc'])}</p>
    <div class="pd-price"><span class="price locked" data-pp="{f['id']}" data-mode="range">{LOCK}</span><span class="tax" id="priceNote"><a href="/account/">Sign in</a> or <a href="/account/#register">create a free account</a> to see prices and download an official GST quotation.</span></div>
    <div class="vtable-wrap"><table class="vtable"><thead><tr><th>Size / option</th><th>Part no.</th><th>Price</th><th>Stock</th><th>Qty</th><th></th></tr></thead><tbody>{''.join(vrow(r) for r in f['vrows'])}</tbody></table></div>
    <ul class="pd-assure"><li>{ico("pdf")}Official GST quotation PDF from the cart</li><li>{ico("doc")}GST invoice with HSN on every order</li><li>{ico("truck")}Dispatch from Chennai across South India</li></ul>
    <div class="pd-help"><span>Need a large quantity or a different size?</span><a class="btn btn-ghost" href="/contact/">Ask for a bulk price</a></div>
  </div></div></div></section>
<nav class="pd-tabs" aria-label="Product information"><div class="wrap"><a href="#details">Product details</a><a href="#specs">Specifications</a><a href="#guide">Buying guide</a><a href="#faq">FAQs</a></div></nav>
<section class="band tight" id="details"><div class="wrap pd-body">
  <div class="pd-main">
    <h2>About the {E(f['name'])}</h2><p>{E(f['desc'])}</p>{f'<p>{E(ov)}</p>' if ov else ''}
    <h3>Key features</h3><ul class="pd-feats">{''.join(f'<li>{E(x)}</li>' for x in f['feats'])}</ul>
    <h3>Typical applications</h3><ul class="pd-feats">{''.join(f'<li>{E(a)}</li>' for a in APPS[f['cat']])}</ul>
    <h2 id="specs">Specifications</h2><div class="spec-wrap"><table class="spec">{''.join(f'<tr><th>{E(k)}</th><td>{E(v)}</td></tr>' for k,v in sp)}</table></div>
    <h2 id="guide">{E(g[0])}</h2><p>{E(g[1])}</p><h3>Care and safety</h3><p>{E(g[2])}</p>
    <h2 id="faq">Frequently asked questions</h2>{faq_html(fq)}
  </div>
  <aside class="pd-side"><div class="side-card"><b>Buying for a business?</b><p>Create a free trade account to see your prices, save time on repeat orders and download official GST quotations.</p><a class="btn btn-amber" href="/account/#register">Create account</a><a class="lnk" href="/account/">Sign in →</a></div>
  <div class="side-card"><b>Talk to our team</b><p>Not sure which size or model you need? Our sales team will help.</p><a class="btn btn-ghost" href="https://wa.me/{CONFIG['phone_raw']}?text={E('Hello MRO Mogul, I need help with: '+f['name'])}" target="_blank" rel="noopener">{ico("wa")}WhatsApp</a><a class="lnk" href="tel:+{CONFIG['phone_raw']}">{CONFIG['phone']}</a></div>
  <div class="side-card"><b>More from {E(f['brand'])}</b><p><a href="{BR(f['brand'])}">All {E(f['brand'])} products →</a></p><p><a href="{CAT(f['cat'])}">All {E(cn.lower())} →</a></p></div></aside>
</div></section>
<section class="band tight paper"><div class="wrap" style="display:grid;gap:16px"><div class="sec-head" style="margin-bottom:0"><span class="eyebrow">Related</span><h2>More in {E(cn)}</h2></div><div class="pgrid pgrid-5">{''.join(card(x,i) for i,x in enumerate(rel))}</div></div></section>'''
    prod={"@context":"https://schema.org","@type":"Product","name":f['name'],"image":[f"{DOMAIN}/img/p/{f['id']}.jpg"],"description":(f['desc']+" "+ov).strip(),
          "brand":{"@type":"Brand","name":f['brand']},"sku":f['vrows'][0]['sku'],"mpn":f['vrows'][0]['sku'],"category":cn,
          "additionalProperty":[{"@type":"PropertyValue","name":k,"value":v} for k,v in sp if k not in ("Feature",)][:10]}
    vtxt=", ".join(r['variant'] for r in f['vrows'][:3])
    title=f"{f['name']} – Sizes, Specs & Dealer Price | MRO Mogul"
    desc=f"{f['name']}: {n} {'sizes' if n>1 else 'option'} ({vtxt}{'…' if n>3 else ''}). {f['desc'][:90].rsplit(' ',1)[0]}. Genuine {f['brand']}, GST invoice, official quote. Chennai."
    write(url,page(title,desc,url,body,active='/products/',ld=[prod,crumb_ld([("Home","/"),(f['brand'],BR(f['brand'])),(cn,CAT(f['cat'])),(f['name'],url)]),faq_ld(fq)],og=f"/img/p/{f['id']}.jpg"))

write('/item/',page("Product | MRO Mogul","Product details","/item/",f'{crumbs([("Home","/"),("Product","/item/")])}<section class="band tight"><div class="wrap" id="itemBox"><p>Loading product…</p></div></section>',noindex=True))

# ---------- account: sign in / register / dashboard ----------
STATES=["Tamil Nadu","Karnataka","Andhra Pradesh","Kerala","Telangana","Puducherry","Maharashtra","Other"]
fld=lambda id_,name,label,req=False,typ='text',extra='': f'<div class="fld"><label for="{id_}">{label}{" <i>*</i>" if req else ""}</label><input id="{id_}" name="{name}" type="{typ}"{" required" if req else ""} {extra}><span class="err" hidden></span></div>'
TABS=[('overview','Overview'),('quotes','Quotations'),('orders','Orders'),('invoices','Invoices & statement'),('reorder','Reorder & reminders'),('profile','Profile')]
acct=f'''{crumbs([("Home","/"),("Account","/account/")])}
<section class="band tight"><div class="wrap">
 <div class="note-box" id="acctLocal" hidden>You are viewing a saved copy of the site. Sign-in and your account work on the live site at mromogul.com.</div>
 <div class="note-box" id="acctNote" hidden></div>
 <div class="acct-page" id="acctBox">
  <div class="acct-main" id="acctForms">
      <div class="atabs" role="tablist"><button class="atab" role="tab" data-t="in" aria-selected="true">Sign in</button><button class="atab" role="tab" data-t="up" aria-selected="false">Create a free account</button></div>
      <form class="enq" id="loginForm" novalidate><h2>Sign in to your account</h2>
        {fld("l-email","email","Email",True,"email",'autocomplete="email"')}{fld("l-pass","password","Password",True,"password",'autocomplete="current-password"')}
        <div class="fmsg quote-msg err" hidden></div><button class="btn btn-amber" type="submit">Sign in</button>
        <p class="small"><a href="#" id="forgotLink">Forgot your password?</a></p></form>
      <form class="enq" id="forgotForm" hidden novalidate><h2>Reset your password</h2><p class="small">Enter the email you registered with. We will send you a link to choose a new password.</p>
        {fld("f-email","email","Email",True,"email",'autocomplete="email"')}<div class="fmsg quote-msg" hidden></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-amber" type="submit">Email me a reset link</button><a class="btn btn-ghost" href="#" id="backLogin">Back to sign in</a></div></form>
      <form class="enq" id="regForm" hidden novalidate><h2>Create your trade account</h2><p class="small">Your profile is set up in our customer system so quotations and invoices carry the right company details.</p>
        <fieldset class="ctype"><legend>I am buying as <i>*</i></legend>
          <label><input type="radio" name="customer_type" value="End User" required> <b>End user</b><span>Plant, factory, workshop or contractor buying for our own use</span></label>
          <label><input type="radio" name="customer_type" value="Reseller"> <b>Reseller</b><span>Dealer, trader or distributor buying to resell</span></label>
          <span class="err" hidden></span></fieldset>
        <div class="frow">{fld("r-name","name","Your full name",True,"text",'autocomplete="name"')}{fld("r-company","company","Company / business name",False,"text",'autocomplete="organization"')}</div>
        <div class="frow">{fld("r-email","email","Work email",True,"email",'autocomplete="email"')}{fld("r-phone","phone","Mobile",True,"tel",'autocomplete="tel"')}</div>
        <div class="frow">{fld("r-gstin","gstin","GSTIN",False,"text",'maxlength="15" style="text-transform:uppercase" placeholder="For GST quotations and invoices"')}<div class="fld"><label for="r-state">State <i>*</i></label><select id="r-state" name="state">{"".join(f"<option>{s}</option>" for s in STATES)}</select></div></div>
        <div class="fld"><label for="r-addr">Billing address</label><textarea id="r-addr" name="address" style="min-height:70px" autocomplete="street-address"></textarea><span class="err" hidden></span></div>
        <div class="frow">{fld("r-city","city","City",False,"text",'autocomplete="address-level2"')}{fld("r-pin","pincode","PIN code",False,"text",'inputmode="numeric" maxlength="6" autocomplete="postal-code"')}</div>
        {fld("r-pass","password","Create a password",True,"password",'autocomplete="new-password" minlength="8"')}
        <p hidden><label>Leave empty <input name="website"></label></p>
        <div class="fmsg quote-msg err" hidden></div><button class="btn btn-amber" type="submit">Create account</button>
        <p class="small">By creating an account you agree to our <a href="/policies/">terms and privacy policy</a>. We never share your details.</p></form>
  </div>
  <aside class="acct-side" id="acctSide"><h3>Why create an account?</h3><ul class="pd-feats"><li>See trade prices on every product and size</li><li>Download official GST quotations instantly</li><li>Accept quotes, track orders and invoices online</li><li>One-click reorders with reminder emails</li><li>Separate pricing for resellers</li></ul>{why_html()}</aside>
 </div>

 <div id="dash" hidden>
  <div class="dash-head"><div><span class="eyebrow">Your account</span><h1 id="dName">Welcome</h1><p id="dSub" class="small"></p></div>
   <div class="dash-actions"><a class="btn btn-amber" href="/products/">Shop products</a><a class="btn btn-ghost" href="/cart/">{ico("cart")}Cart</a><a class="btn btn-ghost" href="#" data-logout>Sign out</a></div></div>
  <nav class="dtabs" aria-label="Account sections">{"".join(f'<a href="#{k}" data-tab="{k}">{v}<b class="dt-n" data-n="{k}" hidden></b></a>' for k,v in TABS)}</nav>
  <div class="dmsg quote-msg" id="dMsg" hidden role="status"></div>

  <section class="dpanel" data-panel="overview">
   <div class="kpis">
    <a class="kpi" href="#invoices"><small>Outstanding balance</small><b id="kOut">—</b><span id="kOutS"></span></a>
    <a class="kpi warn" href="#invoices"><small>Overdue</small><b id="kOver">—</b><span>Please clear overdue invoices to avoid delays</span></a>
    <a class="kpi" href="#quotes"><small>Open quotations</small><b id="kQ">—</b><span>Ready to accept</span></a>
    <a class="kpi" href="#orders"><small>Orders</small><b id="kO">—</b><span id="kOS">Last 50 orders</span></a>
   </div>
   <div class="dash-grid">
    <div class="dcard"><div class="dc-h"><h2>Buy again</h2><a href="#reorder" class="lnk">Reminders →</a></div><div id="lastBox"><p class="small">Loading your last order…</p></div></div>
    <div class="dcard"><div class="dc-h"><h2>Recent quotations</h2><a href="#quotes" class="lnk">All →</a></div><div class="dtable-wrap"><table class="dtable" id="recentQ"></table></div></div>
   </div>
  </section>

  <section class="dpanel" data-panel="quotes" hidden><div class="dcard">
   <div class="dc-h"><h2>Your quotations</h2><a class="btn btn-ghost" href="/cart/">New quotation from cart</a></div>
   <p class="small">Every official quotation issued to your company, including those prepared by our sales team. Accepting a quotation places the order at the quoted prices.</p>
   <div class="dtable-wrap"><table class="dtable" id="tQuotes"></table></div></div></section>

  <section class="dpanel" data-panel="orders" hidden><div class="dcard">
   <div class="dc-h"><h2>Your orders</h2></div><p class="small">Orders placed online, from accepted quotations, or with our sales team.</p>
   <div class="dtable-wrap"><table class="dtable" id="tOrders"></table></div></div></section>

  <section class="dpanel" data-panel="invoices" hidden>
   <div class="dcard"><div class="dc-h"><h2>Pending invoices</h2></div><div class="dtable-wrap"><table class="dtable" id="tPending"></table></div>
    <div class="paybox">{ico("doc")}<div><b>How to pay</b><p>Bank transfer (NEFT / RTGS / IMPS) or UPI to <b>Accelfast Industrial Enterprises</b>. Bank details are printed on every invoice. Please quote the invoice number in the payment reference and share the UTR on WhatsApp <a href="https://wa.me/{CONFIG['phone_raw']}" target="_blank" rel="noopener">{CONFIG['phone']}</a>.</p></div></div></div>
   <div class="dcard"><div class="dc-h"><h2>Statement of account</h2></div>
    <form class="stform" id="stForm"><div class="fld"><label for="stFrom">From</label><input type="date" id="stFrom" required></div><div class="fld"><label for="stTo">To</label><input type="date" id="stTo" required></div>
     <button class="btn btn-blue" type="submit">{ico("pdf")}Download statement (PDF)</button></form>
    <div class="st-quick"><button type="button" class="chip" data-range="fy">This financial year</button><button type="button" class="chip" data-range="lfy">Last financial year</button><button type="button" class="chip" data-range="90">Last 90 days</button></div></div>
   <div class="dcard"><div class="dc-h"><h2>All invoices</h2></div><div class="dtable-wrap"><table class="dtable" id="tInv"></table></div></div>
  </section>

  <section class="dpanel" data-panel="reorder" hidden>
   <div class="dcard"><div class="dc-h"><h2>Reorder your last order</h2></div><div id="lastBox2"></div></div>
   <div class="dcard"><div class="dc-h"><h2>Reorder reminders by email</h2></div>
    <p class="small">We will email you when it is time to restock, with a one-click button to place the same order again. You can change quantities before confirming.</p>
    <form class="remform" id="remForm"><label for="remDays">Remind me</label><select id="remDays">
     <option value="0">Never</option><option value="7">7 days after each order</option><option value="15">15 days after each order</option><option value="30">30 days after each order</option><option value="45">45 days after each order</option><option value="60">60 days after each order</option><option value="90">90 days after each order</option></select>
     <button class="btn btn-blue" type="submit">Save</button><span class="small" id="remState"></span></form></div>
  </section>

  <section class="dpanel" data-panel="profile" hidden>
   <div class="dash-grid">
    <div class="dcard"><div class="dc-h"><h2>Company profile</h2></div><table class="spec" id="profTable"></table><p class="small" style="margin-top:12px">To change your company details or customer type, <a href="/contact/">contact us</a> and we will update your profile in our system.</p></div>
    <div class="dcard"><div class="dc-h"><h2>Change password</h2></div><form class="enq bare" id="pwForm" novalidate>{fld("p-old","old_password","Current password",True,"password",'autocomplete="current-password"')}{fld("p-new","new_password","New password",True,"password",'autocomplete="new-password" minlength="8"')}<div class="fmsg quote-msg" hidden></div><button class="btn btn-blue" type="submit">Update password</button></form></div>
   </div>
  </section>
 </div>
</div></section>
<dialog id="accDlg" class="dlg"><form method="dialog" id="accForm"><h2>Accept quotation <span id="accNo"></span></h2><p class="small">Accepting places the order at the quoted prices. Our team will confirm dispatch and send the invoice.</p>
 <div class="fld"><label for="accPo">Your PO number (optional)</label><input id="accPo" maxlength="50"></div><div class="fmsg quote-msg err" hidden></div>
 <div class="dlg-b"><button class="btn btn-amber" value="ok" id="accOk">Accept and place order</button><button class="btn btn-ghost" value="cancel" formnovalidate>Cancel</button></div></form></dialog>'''
write('/account/',page("Your Account | MRO Mogul","Sign in or create a free MRO Mogul trade account to see prices, download official GST quotations, accept quotes, track orders and invoices.","/account/",acct,noindex=True))
reset=f'''{crumbs([("Home","/"),("Account","/account/"),("Reset password","/account/reset/")])}<section class="band tight"><div class="wrap" style="max-width:560px">
<form class="enq" id="resetForm" novalidate><h1 style="font-size:1.8rem">Choose a new password</h1>{fld("n-pass","password","New password",True,"password",'autocomplete="new-password" minlength="8"')}{fld("n-pass2","password2","Repeat new password",True,"password",'autocomplete="new-password"')}
<div class="fmsg quote-msg" hidden></div><button class="btn btn-amber" type="submit">Save new password</button></form></div></section>'''
write('/account/reset/',page("Reset Password | MRO Mogul","Reset your MRO Mogul password.","/account/reset/",reset,noindex=True))
reorder=f'''{crumbs([("Home","/"),("Reorder","/reorder/")])}<section class="band tight"><div class="wrap" style="max-width:860px;display:grid;gap:18px" id="roBox">
<div><span class="eyebrow">One-click reorder</span><h1 style="font-size:clamp(1.6rem,3vw,2.2rem)" id="roTitle">Loading your last order…</h1><p class="small" id="roSub"></p></div>
<div class="dcard" id="roCard" hidden><div class="dtable-wrap"><table class="dtable" id="roTable"></table></div>
 <form class="enq bare" id="roForm" style="margin-top:16px"><div class="fld"><label for="ro-addr">Deliver to</label><textarea id="ro-addr" style="min-height:70px"></textarea></div><div class="fld"><label for="ro-po">Your PO number (optional)</label><input id="ro-po" maxlength="50"></div>
 <div class="note-box">Prices are today's prices for your account. The order goes to our team for confirmation, then we send the proforma invoice. No payment is taken online.</div><div class="fmsg quote-msg" hidden></div>
 <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-amber" type="submit" id="roBtn">Place this order</button><a class="btn btn-ghost" href="/account/#reorder" id="roEdit">Change quantities</a></div></form></div>
<div class="empty-cart" id="roDone" hidden style="text-align:left;justify-items:start"><h2 id="roDoneT"></h2><p>We have emailed you a confirmation. Our team will confirm stock and send the proforma invoice.</p><a class="btn btn-blue" href="/account/#orders">View your orders</a></div>
</div></section>'''
write('/reorder/',page("Reorder | MRO Mogul","Reorder your last MRO Mogul order in one click.","/reorder/",reorder,noindex=True))

# ---------- cart ----------
cart=f'''{crumbs([("Home","/"),("Cart","/cart/")])}
<section class="band tight"><div class="wrap" style="display:grid;gap:20px">
  <h1>Cart &amp; official quotation</h1>
  <div id="cartEmpty" class="empty-cart" hidden><h2>Your cart is empty</h2><p>Add the sizes you need, then download an official quotation or place an order.</p><a class="btn btn-blue" href="/products/">Browse products</a></div>
  <div id="orderDone" class="empty-cart" hidden style="text-align:left;justify-items:start"><h2 id="doneTitle">Thank you. Your order has been placed.</h2><p>A confirmation is on its way to your email. We will confirm stock and freight, then send a proforma invoice with payment details. For urgent orders call {CONFIG['phone']}.</p><div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn btn-blue" href="/account/#orders">Track this order</a><a class="btn btn-ghost" href="/products/">Continue shopping</a></div></div>
  <div id="cartWrap" class="cart-grid" hidden>
    <div style="display:grid;gap:18px">
      <div class="cart-lines" id="cartLines"></div>
      <div id="signedOut" class="signin-box">{ico("lock")}<div><b>Sign in to see prices and download your official quotation</b><p>Your quotation is created in our accounting system under your registered company details.</p></div><div class="sb-b"><a class="btn btn-amber" href="/account/?next=cart">Sign in</a><a class="btn btn-ghost" href="/account/?next=cart#register">Create account</a></div></div>
      <form class="enq" id="signedIn" hidden novalidate><textarea id="f-order" hidden></textarea>
        <div><span class="eyebrow">Place your order</span><h2 style="margin-top:8px;font-size:1.4rem">Ordering as</h2><div class="who-mini" id="who"></div></div>
        <div class="fld"><label for="o-addr">Delivery address <i>*</i></label><textarea id="o-addr" name="delivery_address" style="min-height:76px"></textarea><span class="err" hidden>Please enter the delivery address.</span></div>
        <div class="fld"><label for="o-po">Your PO number (optional)</label><input id="o-po" name="po_number"></div>
        <div class="fld"><label for="o-notes">Notes (optional)</label><textarea id="o-notes" name="notes" style="min-height:60px" placeholder="Preferred delivery date, alternate brands…"></textarea></div>
        <div class="note-box">Your order is recorded straight into our system. We confirm stock and freight, then send a proforma invoice for bank transfer / UPI. No payment is taken online.</div><div class="fmsg quote-msg err" hidden></div>
        <div style="display:flex;flex-wrap:wrap;gap:10px"><button class="btn btn-blue" type="submit" id="placeBtn">Place order</button><a class="btn wa" id="waBtn" href="https://wa.me/{CONFIG['phone_raw']}" target="_blank" rel="noopener">{ico("wa")}Order on WhatsApp</a></div>
      </form>
    </div>
    <aside class="summary" aria-label="Order summary">
      <h3>Summary</h3>
      <div class="row"><span>Items total</span><b id="sSub"></b></div><div class="row"><span>GST to be added</span><b id="sGst"></b></div><small id="sGstIn"></small>
      <div class="row"><span>Freight</span><span>Confirmed on invoice</span></div><div class="row total"><span>Estimated total</span><span id="sTot"></span></div>
      <div class="quote-box"><button class="btn btn-pdf" type="button" id="quoteBtn">{ico("pdf")}Download Official PDF quote instantly</button>
        <p>Created in Zoho Books for your registered company, with GST and HSN. A copy is saved with our sales team.</p><div id="quoteMsg" class="quote-msg" hidden role="status"></div></div>
      <a href="/products/" style="font-size:.9rem">← Continue shopping</a>
    </aside>
  </div>
</div></section>'''
write('/cart/',page("Cart & Official Quotation | MRO Mogul","Review your cart, download an official GST quotation or place an order request.","/cart/",cart,noindex=True))
write('/order-received/',page("Order Request Received | MRO Mogul","Thank you.","/order-received/",f'<section class="band"><div class="wrap empty-cart"><h1>Thank you. Your order request has been sent.</h1><p>We will confirm availability and share a proforma invoice. Call {CONFIG["phone"]} for urgent orders.</p><a class="btn btn-blue" href="/products/">Continue shopping</a></div></section>',noindex=True))

# ---------- about / contact / policies ----------
about=f'''{crumbs([("Home","/"),("About us","/about/")])}{page_head("About us","An online MRO store with 15+ years of supply behind it","MRO Mogul is the online store of Accelfast Industrial Enterprises, the Chennai industrial supplier serving South Indian plants since 2009.")}
<section class="band"><div class="wrap">{WHO}</div></section>
<section class="band paper"><div class="wrap"><div class="sh-row"><div><span class="eyebrow">Our promise</span><h2>Why customers buy from us</h2></div></div>{why_html()}</div></section>
<section class="band"><div class="wrap split"><div class="prose"><span class="eyebrow">Why we built MRO Mogul</span><h2 style="margin-bottom:6px">Buying tools and automation parts should be as quick as using them</h2>
<p>Plant engineers and purchase teams spend too long chasing quotations for everyday items: a box of push-in fittings, a set of spanners, a solenoid valve for a breakdown. MRO Mogul puts genuine branded products online with part numbers and HSN codes, so you can build a cart, download an official GST quotation for approval and place the order the same day.</p>
<p>Our customers include automotive and auto component plants, renewable energy and power companies, fabrication and assembly units, pharmaceutical and electronics manufacturers across Tamil Nadu, Karnataka, Andhra Pradesh and Kerala.</p></div>
<div class="values"><div><h4>Industrial and automation focus</h4><p>Pneumatic valves, cylinders, FRLs and fittings alongside the hand tools every maintenance team needs.</p></div><div><h4>Trade pricing</h4><p>Separate pricing for end users and resellers, visible after sign-in.</p></div><div><h4>Official paperwork</h4><p>Quotations and invoices from our accounting system, in your company's name.</p></div><div><h4>Local supply</h4><p>Dispatch from Chennai to customers across South India.</p></div></div></div></section>
<section class="band paper" id="faq"><div class="wrap faq-wrap"><div><span class="eyebrow">Questions</span><h2>Frequently asked questions</h2></div>{faq_html(HOME_FAQ)}</div></section>'''
write('/about/',page("About MRO Mogul | Online MRO Store by Accelfast Industrial Enterprises, Chennai","MRO Mogul is the online store of Accelfast Industrial Enterprises, Chennai: genuine industrial MRO and automation products for South Indian industry since 2009.","/about/",about,active='/about/',ld=[faq_ld(HOME_FAQ)]))
contact=f'''{crumbs([("Home","/"),("Contact","/contact/")])}{page_head("Contact","Bulk quotes and product enquiries","Send your indent, BOQ or a single part number. We reply with price, pack size and delivery date.")}
<section class="band"><div class="wrap contact-grid"><div class="cinfo">
<div class="ccard"><span class="ic">{ico("pin")}</span><div><small>Visit</small><div class="v">MRO Mogul (Accelfast Industrial Enterprises)<br>165 Broadway, Chennai – 600 108, Tamil Nadu</div><a class="mini" style="display:inline-block;margin-top:8px;text-decoration:none" href="https://www.google.com/maps/search/?api=1&amp;query=165+Broadway+Chennai+600108" target="_blank" rel="noopener">Open in Google Maps</a></div></div>
<div class="ccard"><span class="ic">{ico("phone")}</span><div><small>Call / WhatsApp</small><div class="v"><a href="tel:+{CONFIG['phone_raw']}">{CONFIG['phone']}</a></div></div></div>
<div class="ccard"><span class="ic">{ico("doc")}</span><div><small>Email</small><div class="v"><a href="mailto:{CONFIG['email']}">{CONFIG['email']}</a></div></div></div>
</div>
<div><form class="enq" id="enq" name="enquiry" method="POST" action="/thank-you/" data-netlify="true" netlify-honeypot="bot-field"><input type="hidden" name="form-name" value="enquiry"><p hidden><label>Leave empty <input name="bot-field"></label></p>
<div><span class="eyebrow">Enquiry</span><h2 style="margin-top:8px;font-size:1.5rem">Request a bulk quote</h2></div>
<div class="frow"><div class="fld"><label for="c-name">Name <i>*</i></label><input id="c-name" name="name" required></div><div class="fld"><label for="c-company">Company</label><input id="c-company" name="company"></div></div>
<div class="frow"><div class="fld"><label for="c-phone">Mobile <i>*</i></label><input id="c-phone" name="phone" type="tel" required></div><div class="fld"><label for="c-email">Email</label><input id="c-email" name="email" type="email"></div></div>
<div class="fld"><label for="c-msg">Requirement <i>*</i></label><textarea id="c-msg" name="message" required placeholder="Product, size, brand and quantity"></textarea></div>
<button class="btn btn-amber" type="submit">Send enquiry</button></form></div></div></section>'''
write('/contact/',page("Contact MRO Mogul | Bulk Quotes for Industrial Tools & Pneumatics, Chennai","Contact MRO Mogul, 165 Broadway, Chennai. Call +91 98840 64464 or send your indent for a bulk quotation on tools, pneumatics and fittings.","/contact/",contact,active='/contact/'))
write('/thank-you/',page("Thank You | MRO Mogul","Thank you.","/thank-you/",'<section class="band"><div class="wrap empty-cart"><h1>Thank you for your enquiry</h1><p>We will reply shortly.</p><a class="btn btn-blue" href="/products/">Browse products</a></div></section>',noindex=True))
policies=f'''{crumbs([("Home","/"),("Policies","/policies/")])}<section class="band tight"><div class="wrap policy">
<h1>Shipping, returns, payment and privacy</h1><p class="note-box">Draft policies. Please review with your accountant or legal adviser before going live.</p>
<h2>Accounts and pricing</h2><p>Prices are shown to registered customers. We may offer different price lists to end users and resellers. Account details are verified by our team and accounts may be suspended for misuse.</p>
<h2>Orders and payment</h2><p>Orders placed on this website, including accepted quotations and one-click reorders, are recorded as sales orders and are subject to our confirmation. We confirm stock, delivery charges and the final amount, then send a proforma invoice. Payment is by bank transfer or UPI unless credit terms have been agreed. A GST tax invoice is issued for every order.</p>
<h2>Quotations</h2><p>Quotations downloaded from the website are issued from our accounting system and are valid until the expiry date shown, subject to stock availability.</p>
<h2>Shipping and delivery</h2><p>Orders are dispatched from Chennai by courier, transport or our own vehicle depending on size and location. Typical delivery is 1–3 working days within Chennai and 3–7 working days elsewhere in South India, subject to stock.</p>
<h2>Returns and replacements</h2><p>Report damaged, short or incorrect items within 48 hours of delivery with photos, and we will arrange a replacement or credit. Products must be unused and in original packing. Special-order items, cut lengths (such as PU tube by the metre) and consumables are not returnable unless defective. Manufacturer warranties apply as per the brand's terms.</p>
<h2>Privacy</h2><p>We collect your name, contact details, company, GSTIN, address and customer type to manage your account, prepare quotations and invoices, and process orders. Your login is stored in our website's secure database; passwords are stored only as a one-way encrypted hash and cannot be read by anyone, including our staff. Your company profile, quotations, orders and invoices are kept in our customer and accounting systems (Zoho CRM and Zoho Books). We send order confirmations and, only if you switch them on, reorder reminder emails; every reminder has a one-click unsubscribe link. We do not sell or share your data except with couriers and payment processors needed to fulfil your order. To update or delete your information, email {CONFIG['email']}.</p>
<h2>Contact</h2><p>MRO Mogul, a unit of Accelfast Industrial Enterprises, 165 Broadway, Chennai – 600 108. Phone {CONFIG['phone']}.</p></div></section>'''
write('/policies/',page("Shipping, Returns, Payment & Privacy | MRO Mogul","Shipping, returns, payment and privacy policies for MRO Mogul.","/policies/",policies))
open(OUT+'/404.html','w').write(page("Page Not Found | MRO Mogul","Page not found.","/404.html",'<section class="band"><div class="wrap empty-cart"><h1>We couldn\'t find that page</h1><p>Search the catalogue or browse categories.</p><a class="btn btn-amber" href="/products/">Browse products</a></div></section>',noindex=True))

# ---------- SEO files ----------
urls=[('/','1.0',None),('/products/','0.9',None),('/brands/','0.8',None),('/categories/','0.8',None),('/about/','0.6',None),('/contact/','0.6',None),('/policies/','0.3',None)]+[(BR(b),'0.8',None) for b in BRANDS]+[(CAT(c[0]),'0.8',None) for c in CATS]+[(PROD(f['id']),'0.7',f) for f in F]
sm='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n'
for u,p,f in urls:
    img=f'<image:image><image:loc>{DOMAIN}/img/p/{f["id"]}.jpg</image:loc></image:image>' if f else ''
    sm+=f'  <url><loc>{DOMAIN}{u}</loc><lastmod>{TODAY}</lastmod><priority>{p}</priority>{img}</url>\n'
open(OUT+'/sitemap.xml','w').write(sm+'</urlset>\n')
open(OUT+'/robots.txt','w').write(f'User-agent: *\nAllow: /\nDisallow: /cart/\nDisallow: /account/\nDisallow: /api/\nDisallow: /order-received/\nDisallow: /thank-you/\nDisallow: /item/\nDisallow: /reorder/\n\nSitemap: {DOMAIN}/sitemap.xml\n')
open(OUT+'/_redirects','w').write('https://www.mromogul.com/* https://mromogul.com/:splat 301!\nhttp://www.mromogul.com/* https://mromogul.com/:splat 301!\n')
open(OUT+'/_headers','w').write('/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: SAMEORIGIN\n/img/*\n  Cache-Control: public, max-age=2592000\n/assets/*\n  Cache-Control: public, max-age=3600\n')

# ---------- relative links so pages also open from disk ----------
LOCALFIX=r'<script>if(location.protocol==="file:")document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[href]");if(!a)return;var h=a.getAttribute("href");if(!h||/^(https?:|mailto:|tel:|#|javascript:)/.test(h))return;var u=new URL(h,location.href);if(/\/$/.test(u.pathname)){e.preventDefault();location.href=u.href.replace(/\/([?#]|$)/,"/index.html$1")}},true)</script>'
for root,_,files in os.walk(OUT):
    for fn in files:
        if not fn.endswith('.html'): continue
        p=os.path.join(root,fn); rel=os.path.relpath(root,OUT); depth=0 if rel=='.' else rel.count(os.sep)+1; pre='../'*depth or './'
        h=open(p).read(); h=re.sub(r'(\s(?:href|src|action)=")/(?!/)',lambda m:m.group(1)+pre,h); h=h.replace('</title>','</title>\n'+LOCALFIX,1); open(p,'w').write(h)
print('built',len(F),'products',len(rows),'rows',sum(len(x) for _,_,x in os.walk(OUT)),'files')
