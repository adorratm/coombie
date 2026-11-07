#!/usr/bin/env python3
"""
Generates the support-call audio (run from apps/game-client):

  python3 scripts/gen-support-audio.py <piper-voice.onnx>

- Turkish radio voice lines with Piper TTS (tr_TR-dfki-medium, MIT/CC-BY voice),
  run through a radio filter (band-pass, compression, squelch + beep).
- Synthesised vehicle / ordnance SFX (jet flyby, helicopter, artillery whistle,
  missile, explosion) — procedural, no third-party samples.
Outputs .ogg files into public/sfx/voice and public/sfx/support.
"""
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np

VOICE = sys.argv[1] if len(sys.argv) > 1 else '/tmp/voice/tr_TR-dfki-medium.onnx'
OUT_V = 'public/sfx/voice'
OUT_S = 'public/sfx/support'
os.makedirs(OUT_V, exist_ok=True)
os.makedirs(OUT_S, exist_ok=True)
SR = 44100

# id -> (caller line, reply line, caller voice: m|f)
LINES = {
    'jet': ('İki gözüm, aydınlat hele şuraları!', 'Anlaşıldı, şahin geliyor. Başınızı eğin!', 'm'),
    'heli': ('Kirvem, şuraları bir aydınlat hele!', 'Kirve geliyor, tarıyoruz!', 'm'),
    'artillery': ('Topçu abi, koordinatları attım, yak gitsin!', 'Atış serbest, mermiler yolda!', 'm'),
    'siha': ('Siha, hedefler işaretli. Vur hepsini!', 'Hedefler kilitlendi, angajman başladı.', 'f'),
    'supply': ('Kardeşim bir paket at, mermi bitti burada!', 'Paket yolda, sinyal dumanını yakın!', 'f'),
}


def write_wav(path, data, sr=SR):
    data = np.clip(data, -1, 1)
    if data.ndim == 1:
        data = data[:, None]
    pcm = (data * 32767).astype(np.int16)
    with wave.open(path, 'wb') as w:
        w.setnchannels(pcm.shape[1])
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def to_ogg(src, dst, extra=None):
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-i', src]
    if extra:
        cmd += ['-af', extra]
    cmd += ['-c:a', 'libvorbis', '-q:a', '4', dst]
    subprocess.run(cmd, check=True)


def tts(text, path):
    subprocess.run([sys.executable, '-m', 'piper', '-m', VOICE, '-f', path], input=text.encode('utf-8'), check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def radio_chain(pitch=1.0, harsh=False):
    sr = 22050
    f = []
    if pitch != 1.0:
        f += [f'asetrate={int(sr * pitch)}', f'aresample={sr}', f'atempo={1 / pitch:.4f}']
    f += ['highpass=f=380', 'lowpass=f=3100', 'acompressor=threshold=-20dB:ratio=8:attack=5:release=60:makeup=6']
    if harsh:
        f += ['acrusher=bits=10:mix=0.35']
    f += ['volume=1.6', f'aresample={SR}', 'apad=pad_dur=0.05']
    return ','.join(f)


def squelch(dur, level=0.18, seed=1):
    rng = np.random.default_rng(seed)
    n = int(SR * dur)
    x = rng.standard_normal(n) * level
    env = np.linspace(1, 0, n) ** 1.5
    return x * env


def beep(f=1250, dur=0.07):
    t = np.arange(int(SR * dur)) / SR
    return 0.25 * np.sin(2 * np.pi * f * t) * np.hanning(len(t))


def read_wav(path):
    with wave.open(path) as w:
        raw = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32767
        if w.getnchannels() == 2:
            raw = raw.reshape(-1, 2).mean(axis=1)
    return raw


def voice_line(text, dst, pitch, harsh, seed):
    with tempfile.TemporaryDirectory() as td:
        raw = os.path.join(td, 'raw.wav')
        filt = os.path.join(td, 'f.wav')
        tts(text, raw)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', raw, '-af', radio_chain(pitch, harsh), '-ac', '1', filt], check=True)
        v = read_wav(filt)
        rng = np.random.default_rng(seed)
        hiss = rng.standard_normal(len(v)) * (0.02 if harsh else 0.012)
        body = v + hiss
        clip = np.concatenate([beep(), squelch(0.09, 0.12, seed), body, squelch(0.16, 0.2, seed + 7)])
        mix = os.path.join(td, 'mix.wav')
        write_wav(mix, clip)
        to_ogg(mix, dst)


def env_adsr(n, a, r):
    e = np.ones(n)
    na, nr = int(a * n), int(r * n)
    e[:na] = np.linspace(0, 1, na)
    e[n - nr:] = np.linspace(1, 0, nr)
    return e


def onepole_lp(x, cutoff):
    """time-varying one-pole low-pass; cutoff array in Hz"""
    y = np.zeros_like(x)
    a = np.exp(-2 * np.pi * np.asarray(cutoff) / SR)
    a = np.broadcast_to(a, x.shape)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a[i]) * x[i] + a[i] * acc
        y[i] = acc
    return y


def brown(n, rng):
    w = rng.standard_normal(n)
    b = np.cumsum(w)
    b -= onepole_lp(b, np.full(n, 20.0))
    return b / (np.abs(b).max() + 1e-9)


def jet():
    rng = np.random.default_rng(3)
    dur = 4.2
    n = int(SR * dur)
    t = np.arange(n) / SR
    peak = 1.9
    d = np.abs(t - peak)
    loud = 1 / (1 + (d * 2.2) ** 2)
    cut = 250 + 3800 * loud ** 1.4
    noise = rng.standard_normal(n)
    roar = onepole_lp(onepole_lp(noise, cut), cut) * 3.5
    rumble = brown(n, rng) * 0.6
    whine_f = np.where(t < peak, 2600, 1500) * (1 + 0.0 * t)
    whine = 0.05 * np.sin(2 * np.pi * np.cumsum(whine_f) / SR) * loud ** 2
    mono = (roar + rumble) * loud + whine
    mono *= env_adsr(n, 0.05, 0.25)
    pan = np.clip((t - peak) / 1.6, -1, 1)
    left = mono * np.sqrt((1 - pan) / 2)
    right = mono * np.sqrt((1 + pan) / 2)
    st = np.stack([left, right], axis=1)
    return st / np.abs(st).max() * 0.9


def heli():
    rng = np.random.default_rng(5)
    dur = 5.0
    n = int(SR * dur)
    t = np.arange(n) / SR
    bpf = 18.0
    phase = (t * bpf) % 1.0
    thump = np.exp(-phase * 9)
    noise = onepole_lp(rng.standard_normal(n), np.full(n, 900.0))
    body = noise * thump * 2.2
    low = 0.35 * np.sin(2 * np.pi * 62 * t) * (0.6 + 0.4 * thump)
    turb = onepole_lp(rng.standard_normal(n), np.full(n, 3000.0)) * 0.12
    loud = 1 / (1 + ((t - 2.4) * 0.9) ** 2)
    mono = (body + low + turb) * loud * env_adsr(n, 0.15, 0.2)
    pan = np.clip((t - 2.4) / 2.2, -1, 1)
    st = np.stack([mono * np.sqrt((1 - pan) / 2), mono * np.sqrt((1 + pan) / 2)], axis=1)
    return st / np.abs(st).max() * 0.85


def whistle():
    dur = 1.3
    n = int(SR * dur)
    t = np.arange(n) / SR
    f = 1500 - 1000 * (t / dur) ** 1.3
    s = np.sin(2 * np.pi * np.cumsum(f) / SR)
    rng = np.random.default_rng(9)
    air = onepole_lp(rng.standard_normal(n), np.full(n, 2500.0)) * 0.25
    e = env_adsr(n, 0.3, 0.05) * (0.3 + 0.7 * t / dur)
    return (s * 0.5 + air) * e * 0.8


def missile():
    rng = np.random.default_rng(11)
    dur = 1.6
    n = int(SR * dur)
    t = np.arange(n) / SR
    cut = 600 + 3000 * np.exp(-t * 1.5)
    x = onepole_lp(rng.standard_normal(n), cut) * 3
    e = env_adsr(n, 0.04, 0.5)
    return np.clip(x * e, -1, 1) * 0.8


def explosion():
    rng = np.random.default_rng(13)
    dur = 2.2
    n = int(SR * dur)
    t = np.arange(n) / SR
    crack = rng.standard_normal(n) * np.exp(-t * 40) * 0.9
    cut = 120 + 2500 * np.exp(-t * 6)
    body = onepole_lp(rng.standard_normal(n), cut) * 4 * np.exp(-t * 2.2)
    sub = np.sin(2 * np.pi * (45 + 30 * np.exp(-t * 5)) * t) * np.exp(-t * 2.5) * 0.8
    deb = onepole_lp(rng.standard_normal(n), np.full(n, 1800.0)) * 0.3 * np.exp(-((t - 0.6) ** 2) * 6)
    x = crack + body + sub + deb
    return x / np.abs(x).max() * 0.95


def main():
    for key, (caller, reply, sex) in LINES.items():
        voice_line(caller, f'{OUT_V}/{key}_call.ogg', 1.22 if sex == 'f' else 0.97, False, 1)
        voice_line(reply, f'{OUT_V}/{key}_reply.ogg', 0.9, True, 2)
        print('voice', key)
    with tempfile.TemporaryDirectory() as td:
        for name, fn in [('jet', jet), ('heli', heli), ('whistle', whistle), ('missile', missile), ('explosion', explosion)]:
            p = os.path.join(td, name + '.wav')
            write_wav(p, fn())
            to_ogg(p, f'{OUT_S}/{name}.ogg')
            print('sfx', name)


main()
