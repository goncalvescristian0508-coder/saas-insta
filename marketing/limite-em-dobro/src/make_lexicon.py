import sys, json, re, unicodedata
from piper.phonemize_espeak import EspeakPhonemizer
D='kokoro-multi-lang-v1_0'
tokens=set(l.split()[0] for l in open(f'{D}/tokens.txt',encoding='utf8') if l.strip() and not l.startswith(' '))
ph=EspeakPhonemizer()
words=set()
for _,text in json.load(open(sys.argv[1])):
    for w in re.findall(r"[0-9A-Za-zÀ-ÿ]+", text.lower()): words.add(w)
out=open(sys.argv[2],'w',encoding='utf8'); missing=set()
for w in sorted(words):
    sents=ph.phonemize('pt-br', w)
    chars=[c for s in sents for c in s]
    toks=[]
    for c in chars:
        if c in tokens: toks.append(c)
        elif c in (' ','\n','.',',','!','?'): continue
        else: missing.add(c)
    if toks: out.write(w+' '+' '.join(toks)+'\n')
out.close()
print('words',len(words),'missing chars',sorted(missing))
