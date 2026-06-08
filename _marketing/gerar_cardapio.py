# -*- coding: utf-8 -*-
"""Gera o cardápio de preços do TecLog+ em PNG (para WhatsApp/apresentação)."""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1600
TEAL_DARK = (15, 118, 110)
TEAL = (13, 148, 136)
TEAL_LIGHT = (20, 184, 166)
AMBER = (245, 158, 11)
INK = (17, 24, 39)
MUTED = (100, 116, 139)
WHITE = (255, 255, 255)
LINE = (226, 232, 240)
SOFT = (236, 253, 250)

FD = "C:/Windows/Fonts/"
def font(name, size):
    return ImageFont.truetype(FD + name, size)

f_logo   = font("segoeuib.ttf", 76)
f_tag    = font("segoeui.ttf", 30)
f_h2     = font("segoeuib.ttf", 50)
f_nome   = font("segoeuib.ttf", 44)
f_preco  = font("segoeuib.ttf", 64)
f_mes    = font("segoeui.ttf", 28)
f_sub    = font("seguisb.ttf", 32)
f_extra  = font("segoeui.ttf", 26)
f_selo   = font("segoeuib.ttf", 23)
f_g_nome = font("segoeuib.ttf", 34)
f_g_sub  = font("segoeui.ttf", 25)
f_g_pre  = font("segoeuib.ttf", 38)
f_feat_t = font("segoeuib.ttf", 32)
f_feat   = font("segoeui.ttf", 27)
f_foot   = font("segoeui.ttf", 26)

img = Image.new("RGB", (W, H), TEAL)
d = ImageDraw.Draw(img)
for y in range(H):
    t = y / H
    c = tuple(int(TEAL_DARK[i] + (TEAL_LIGHT[i] - TEAL_DARK[i]) * t) for i in range(3))
    d.line([(0, y), (W, y)], fill=c)

# Header
d.text((W // 2, 86), "TecLog", font=f_logo, fill=WHITE, anchor="mm")
lw = d.textlength("TecLog", font=f_logo)
d.text((W // 2 + lw // 2 + 22, 86), "+", font=f_logo, fill=(253, 224, 71), anchor="mm")
d.text((W // 2, 152), "Controle de O.S. para equipes técnicas", font=f_tag, fill=(209, 250, 229), anchor="mm")
d.text((W // 2, 222), "Planos e Preços", font=f_h2, fill=WHITE, anchor="mm")

MX = 70
CW = W - 2 * MX


def plano(y, nome, preco, sub, extra, destaque=False, selo=None):
    h = 224
    d.rounded_rectangle([MX, y, MX + CW, y + h], radius=26, fill=WHITE,
                        outline=AMBER if destaque else LINE, width=5 if destaque else 2)
    d.text((MX + 44, y + 38), nome, font=f_nome, fill=TEAL_DARK, anchor="lm")
    if selo:
        sw = d.textlength(selo, font=f_selo) + 36
        d.rounded_rectangle([MX + CW - sw - 30, y + 22, MX + CW - 30, y + 22 + 42], radius=21, fill=AMBER)
        d.text((MX + CW - 30 - sw / 2, y + 22 + 21), selo, font=f_selo, fill=WHITE, anchor="mm")
    d.text((MX + 44, y + 112), preco, font=f_preco, fill=INK, anchor="lm")
    pw = d.textlength(preco, font=f_preco)
    d.text((MX + 44 + pw + 12, y + 124), "/mês", font=f_mes, fill=MUTED, anchor="lm")
    d.text((MX + 44, y + 168), sub, font=f_sub, fill=TEAL, anchor="lm")
    d.text((MX + 44, y + 202), extra, font=f_extra, fill=MUTED, anchor="lm")
    return y + h


gap = 24
y = 296
y = plano(y, "Starter", "R$ 89,90", "Até 5 técnicos", "+ R$ 12 por técnico adicional") + gap
y = plano(y, "Standard", "R$ 119,90", "Até 10 técnicos", "+ R$ 10 por técnico adicional",
          destaque=True, selo="MAIS POPULAR") + gap

# Bloco "Para equipes grandes"
grandes = [
    ("Advanced", "Até 20 técnicos · +R$ 9/extra", "R$ 199,90"),
    ("Professional", "Até 30 técnicos · +R$ 8/extra", "R$ 269,90"),
    ("Premium", "Até 40 técnicos · +R$ 7/extra", "R$ 329,90"),
    ("Enterprise", "50+ técnicos · +R$ 6/extra", "R$ 389,90"),
]
gh = 90 + len(grandes) * 70
d.rounded_rectangle([MX, y, MX + CW, y + gh], radius=26, fill=WHITE, outline=LINE, width=2)
d.text((MX + 44, y + 38), "Para equipes grandes", font=f_feat_t, fill=TEAL_DARK, anchor="lm")
gy = y + 92
for nome, tec, pre in grandes:
    d.text((MX + 44, gy + 6), nome, font=f_g_nome, fill=INK, anchor="lm")
    d.text((MX + 44, gy + 40), tec, font=f_g_sub, fill=MUTED, anchor="lm")
    d.text((MX + CW - 40, gy + 22), pre, font=f_g_pre, fill=TEAL_DARK, anchor="rm")
    gy += 70
y += gh + 26

# Bloco de features
fh = 286
d.rounded_rectangle([MX, y, MX + CW, y + fh], radius=26, fill=SOFT, outline=LINE, width=2)
d.text((MX + 44, y + 38), "Todos os planos incluem:", font=f_feat_t, fill=TEAL_DARK, anchor="lm")
feats = [
    "Registro ilimitado de O.S. com valor automático",
    "Valores de repasse por perfil de técnico",
    "Fechamento por ciclo mensal configurável",
    "Relatório de ganhos e margem (por técnico)",
    "O.S. repetida com foto, notificação e visto",
    "Acesso pelo celular (iOS e Android)",
]
fy = y + 86
for f in feats:
    d.ellipse([MX + 46, fy - 9, MX + 46 + 18, fy + 9], fill=TEAL)
    d.text((MX + 50 + 5, fy - 11), "v", font=font("segoeui.ttf", 22), fill=WHITE)
    d.text((MX + 84, fy), f, font=f_feat, fill=INK, anchor="lm")
    fy += 31
y += fh + 26

d.text((W // 2, y + 4), "Teste sem compromisso · cancele quando quiser", font=f_foot, fill=(209, 250, 229), anchor="mm")

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cardapio-precos.png")
img.save(out, "PNG")
print("salvo:", out, img.size)
