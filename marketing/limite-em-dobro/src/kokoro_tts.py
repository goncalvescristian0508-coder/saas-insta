import sys, json, inspect, sherpa_onnx, soundfile as sf
D='kokoro-multi-lang-v1_0'
params=sherpa_onnx.OfflineTtsKokoroModelConfig.__init__.__doc__ or ''
kw=dict(model=f'{D}/model.onnx',voices=f'{D}/voices.bin',tokens=f'{D}/tokens.txt',data_dir=f'{D}/espeak-ng-data',dict_dir=f'{D}/dict',lexicon='lexicon-pt.txt')
kw['lang']='pt-br'
cfg=sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(**kw),provider='cpu',num_threads=4,debug=False),max_num_sentences=1)
tts=sherpa_onnx.OfflineTts(cfg)
jobs=json.load(open(sys.argv[1]))   # [[id,text],...]
out=sys.argv[2]; sid=int(sys.argv[3]) if len(sys.argv)>3 else 42; speed=float(sys.argv[4]) if len(sys.argv)>4 else 1.0
for id_,text in jobs:
    a=tts.generate(text,sid=sid,speed=speed)
    sf.write(f'{out}/{id_}.wav',a.samples,a.sample_rate)
    print(id_,len(a.samples),a.sample_rate)
