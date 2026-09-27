"""Generates demo/speech.wav + demo/words.json with espeak-ng. Then build the source video:
ffmpeg -f lavfi -i color=c=0x14060c:s=1280x720:r=30 -i speech.wav -filter_complex "[0:v]drawtext=fontfile=/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf:text=KAI\\ NORTH:fontsize=96:fontcolor=white:x=(w-text_w)/2:y=560[v]" -map [v] -map 1:a -shortest -c:v libx264 -pix_fmt yuv420p -c:a aac source.mp4
"""
import json, subprocess, wave, os, re
# Fictional artist "KAI NORTH" — a spoken-word / interview style monologue for the demo.
SENTENCES = [
 "Yo, let me tell you something nobody in this industry wants to say out loud.",
 "I wrote my first hit on a bus with a cracked phone screen and forty cents in my account.",
 "People think the studio makes the record. Nah. The record was already made in my head at three in the morning.",
 "My manager told me to sound more like what was on the radio. I fired him the same night.",
 "That decision cost me two years and a record deal, and it was the best money I never made.",
 "Here's the part they never put in the documentary: I was scared every single day.",
 "Fear is not the opposite of courage. Fear is the ticket price.",
 "Every artist you love was terrified when they made the thing you love.",
 "I stopped counting streams the day I realized numbers were counting me.",
 "Fame is somebody else's story about you, and you are not the author.",
 "The label wanted a hook in the first five seconds. I gave them silence for eight.",
 "They said I was crazy. That track went triple platinum with no radio play.",
 "If you're an artist listening right now, your weird is your currency. Spend it.",
 "Don't polish the rough parts, that's where the fingerprints are.",
 "Back to the bus. Forty cents, cracked screen, no plan, just this voice in my head saying, write it down before it leaves.",
 "So I wrote it down. And it never left.",
 "That's the whole secret. It was never about talent. It was about showing up before you felt ready.",
 "And if you're waiting to feel ready, you already missed the bus.",
]
GAP = 0.45
os.makedirs("seg", exist_ok=True)
words=[]; t=0.0; parts=[]
for i,s in enumerate(SENTENCES):
    f=f"seg/{i:02d}.wav"
    subprocess.run(["espeak-ng","-v","en-us+m3","-s","165","-p","35","-w",f,s],check=True)
    with wave.open(f) as w: dur=w.getnframes()/w.getframerate()
    toks=re.findall(r"[A-Za-z0-9'’]+[.,!?:;]*", s)
    weights=[len(re.sub(r"[^A-Za-z0-9]","",x))+1.5 for x in toks]
    total=sum(weights); speech=dur-0.12; cur=t+0.05
    for tok,wt in zip(toks,weights):
        d=speech*wt/total
        words.append({"word":tok,"start":round(cur,3),"end":round(cur+d*0.92,3)}); cur+=d
    parts.append((f,dur)); t+=dur+GAP
# concat with gaps
with open("concat.txt","w") as c:
    for f,dur in parts: c.write(f"file '{f}'\nfile 'gap.wav'\n")
subprocess.run(["ffmpeg","-y","-loglevel","error","-f","lavfi","-i",f"anullsrc=r=22050:cl=mono","-t",str(GAP),"gap.wav"],check=True)
subprocess.run(["ffmpeg","-y","-loglevel","error","-f","concat","-safe","0","-i","concat.txt","-ar","44100","-ac","2","speech.wav"],check=True)
json.dump(words,open("words.json","w"),indent=1)
json.dump(SENTENCES,open("script.json","w"),indent=1)
print("duration",round(t,2),"words",len(words))
