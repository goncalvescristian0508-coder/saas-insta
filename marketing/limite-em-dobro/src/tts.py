import json, wave, sys
from piper import PiperVoice
from piper.config import SynthesisConfig
v=PiperVoice.load('vits-piper-pt_BR-faber-medium/pt_BR-faber-medium.onnx', config_path='vits-piper-pt_BR-faber-medium/pt_BR-faber-medium.onnx.json')
cfg=SynthesisConfig(length_scale=1.0, noise_scale=0.55, noise_w_scale=0.7)
for id_,text in json.load(open('lines.json')):
    with wave.open(f'lines/{id_}.wav','wb') as w:
        v.synthesize_wav(text, w, syn_config=cfg)
print('done')
