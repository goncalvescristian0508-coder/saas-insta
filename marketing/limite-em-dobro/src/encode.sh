#!/bin/bash
set -e
FF=node_modules/ffmpeg-static/ffmpeg
OUT=/home/user/saas-insta/marketing/limite-em-dobro
mkdir -p "$OUT"
# MP4 (H.264, 9:16, 30fps) with audio
$FF -y -hide_banner -loglevel error -framerate 30 -i frames/%05d.png -i audio/mix.wav \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -profile:v high -level 4.1 -movflags +faststart \
  -c:a aac -b:a 160k -shortest "$OUT/mais-card-limite-em-dobro-9x16.mp4"
# WebM (VP9) lighter for the landing page
$FF -y -hide_banner -loglevel error -framerate 30 -i frames/%05d.png -i audio/mix.wav \
  -c:v libvpx-vp9 -b:v 0 -crf 32 -row-mt 1 -deadline good -cpu-used 2 -pix_fmt yuv420p \
  -c:a libopus -b:a 96k -shortest "$OUT/mais-card-limite-em-dobro-9x16.webm"
# Poster (last frame) and contact sheet
cp frames/00960.png "$OUT/poster.png"
$FF -y -hide_banner -loglevel error -i "$OUT/mais-card-limite-em-dobro-9x16.mp4" -vf "fps=1/2.5,scale=270:-1,tile=7x2" "$OUT/contact-sheet.png"
ls -la "$OUT"
