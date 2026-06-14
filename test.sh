



cd /workspace/src/codec/entropy_coding/cpp_exts/mans && make 
cd /workspace/src/codec/entropy_coding/cpp_exts/direct && make


python -m src.reco.coders.encoder test.png output.bin --set_target_bpp 100 --cfg cfg/tools_off.json cfg/profiles/high.json

python -m src.reco.coders.decoder output.bin rebuild_img.png
