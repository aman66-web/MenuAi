# Chrome queue: LOGOS (the last 9 restaurants without a logo)

Our cloud session can't reach these logo files (bot checks, or the image host's robots.txt refuses automated tools). In your
browser: open the page, find the restaurant's OWN logo (header logo, or its brand/press page), and save the file exactly as the site
serves it (right-click > Save Image As, or Claude in Chrome downloading that one file). Never redraw, recolour or crop; never use a
parent company's logo instead (e.g. not the Shell or bp logo for their cafes), never Google Images or other sites.

For each one, put the file in `web/public/logos/<id>.svg|png|webp` and write `web/public/logos/<id>.source.txt` with these lines:
status: installed / file: <id>.png / kind: header / source_url: <the file's address> / page_url: <the page> / retrieved: <date> /
tile: light (or dark if the logo is white). Then tick the line and push. If a page has no logo file, write the reason on the line.
Claude adds them to the app with tools/logos/assemble_logos.py.

- [ ] bettys | Bettys | https://www.bettys.co.uk/ (Imperva/Incapsula bot challenge, /_Incapsula_Resource); owner https://www.bettysandtaylors.co.uk/robots.txt answers 403 | Open https://www.bettys.co.uk/ and save the "Bettys" script logo at the top centre of the header (right-click > Save Image As, or copy the <svg> element if inline) as bettys.svg/.png; or the Bettys logo on the owner's br
- [ ] chozen | Chozen | https://chozen.co.uk/wp-content/uploads/2021/05/New-Chozen-logo-cropped.png (HTTP 429 Too Many Requests) | Open https://chozen.co.uk/ and save the header logo at the top left (img alt "Chozen", file /wp-content/uploads/2021/05/New-Chozen-logo-cropped.png, 709 x 300) as chozen.png; tile: check on a contact sheet.
- [ ] deli-by-shell | Deli by Shell | https://www.shell.co.uk/shell-service-stations/food-and-drink-offering/deli-by-shell.html | If a deli by Shell logo file exists on shell.co.uk (for example in a press release or on packaging artwork Shell publishes), save it from that page; otherwise the founder decides whether the Shell pecten (https://www.she
- [ ] honi-poke | Honi Poke | https://cdn.prod.website-files.com/robots.txt (403) | Open https://www.honipoke.com/ and save the header logo image (top centre, HP-Logo-main.png from cdn.prod.website-files.com) as honi-poke.png; a wide version is used in the pop-up (6634a66d5013bb37932405e0_Logo%20wide.sv
- [ ] hungry-horse | Hungry Horse | https://www.hungryhorse.co.uk/robots.txt (403 Access Denied, Akamai); owner page https://www.greeneking.co.uk/pubs-restaurants-hotels/hungry-horse (greeneking.co.uk/robots.txt also 403 Access Denied) | Open https://www.hungryhorse.co.uk/ and save the Hungry Horse logo at the top left of the header (right-click > Save Image As; if it is an inline SVG, copy the <svg> element) as hungry-horse.png/.svg; or, on Greene King'
- [ ] kokoro | Kokoro | https://cdn.prod.website-files.com/robots.txt (403) | Open https://www.kokorouk.com/ and save the black KOKORO wordmark at the top of the header (67ad187cd24c5a3e4db3d46b_logoblack.svg from cdn.prod.website-files.com) as kokoro.svg; tile: light.
- [ ] simmons-bakers | Simmons Bakers | https://cdn.prod.website-files.com/6a3281ddf2ebea446380cb56/6a32ae57eef7c3f3e3e457b9_Vector.svg (cdn.prod.website-files.com/robots.txt answers 403) | Open https://sourdough.simmonsbakers.com/ (Simmons' own sourdough page, linked from its home page header) and save the top-left nav logo image (alt text "A picture of the Simmons logo", file ...e457b9_Vector.svg) as simm
- [ ] tesco-cafe | Tesco Cafe |  | The chain's own site refused an automated visit (https://www.tesco.com/ and https://www.tescoplc.com/robots.txt both answered 403 "Access Denied" from the Akamai edge); blocks are never worked around. Save the Tesco Cafe
- [ ] wild-bean-cafe | Wild Bean Cafe | https://assets.bp.com/robots.txt (403) | Open https://www.bp.com/about-us/who-we-are/our-brands and, in the "wildbean cafe" card ("A brand on the move across four continents"), save the card image (alt "wbc logo", file wbc-logo-566x378.png) as wild-bean-cafe.pn
