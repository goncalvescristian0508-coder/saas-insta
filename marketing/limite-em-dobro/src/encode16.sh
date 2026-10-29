#!/bin/bash
set -e
FF=node_modules/ffmpeg-static/ffmpeg
OUT=/home/user/saas-insta/marketing/limite-em-dobro
mkdir -p "$OUT"
$FF -y -hide_banner -loglevel error -framerate 30 -i frames16/%05d.png -i audio2/mix.wav \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -profile:v high -level 4.1 -movflags +faststart \
  -c:a aac -b:a 160k -shortest "$OUT/mais-card-limite-em-dobro-16x9.mp4"
$FF -y -hide_banner -loglevel error -framerate 30 -i frames16/%05d.png -i audio2/mix.wav \
  -c:v libvpx-vp9 -b:v 0 -crf 32 -row-mt 1 -deadline good -cpu-used 2 -pix_fmt yuv420p \
  -c:a libopus -b:a 96k -shortest "$OUT/mais-card-limite-em-dobro-16x9.webm"
cp frames16/01380.png "$OUT/poster-16x9.png"
$FF -y -hide_banner -loglevel error -i "$OUT/mais-card-limite-em-dobro-16x9.mp4" -vf "fps=1/2.35,scale=480:-1,tile=5x4" "$OUT/contact-sheet-16x9.png"
ls -la "$OUT"
