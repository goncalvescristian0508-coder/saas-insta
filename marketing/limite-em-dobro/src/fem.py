import sys, parselmouth
from parselmouth.praat import call
src, dst, formant, pitch = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
snd = parselmouth.Sound(src)
out = call(snd, "Change gender", 75, 600, formant, pitch, 1.0, 1.0)
out.save(dst, "WAV")
print('ok', dst)
