from PIL import Image

hero = Image.open('C:\\Users\\AC\\.gemini\\antigravity\\brain\\299d67b6-9acf-40b7-9d7e-38d8d088d99d\\handbook_hero_1783082877089.png').convert('RGB')
pixels = hero.load()

# Let's search for pink/purple pixels in the polaroid bottom-left area (x: 100-200, y: 700-800)
polaroid_pink = []
for y in range(700, 800):
    for x in range(100, 200):
        r, g, b = pixels[x, y]
        # Typical pink/purple of the Instagram icon
        if r > 180 and g < 100 and b > 100:
            polaroid_pink.append((x, y))

print(f'Found {len(polaroid_pink)} pink pixels in polaroid area')
if polaroid_pink:
    xs = [p[0] for p in polaroid_pink]
    ys = [p[1] for p in polaroid_pink]
    print(f'X range: {min(xs)} to {max(xs)}')
    print(f'Y range: {min(ys)} to {max(ys)}')
    print(f'Center: ({(min(xs)+max(xs))//2}, {(min(ys)+max(ys))//2})')
