# School OS — presentationsmaterial

`School-OS-presentation.pptx` är en pitch på 17 bilder: introduktion till
produkten, affärsplan, budget, distribution och försäljning. Alla
skärmbilder i `shots/` är tagna från den körande prototypen i
`../School OS/`, inte ritade mockuper.

## Bygga om decket

```bash
npm install pptxgenjs
node build.js
```

`build.js` genererar hela decket från grunden. Bilder placeras via
`pic()`, som läser PNG-huvudet och räknar ut höjden från den verkliga
bildproportionen — sätt aldrig både bredd och höjd för hand, då blir
skärmbilden ihoptryckt.

## Granska en ombyggnad

LibreOffice Impress finns inte i den här miljön, så `qa_render.py` läser
det genererade decket med python-pptx och ritar upp varje bild i HTML
utifrån den faktiska geometrin. `qa_shoot.cjs` fotograferar resultatet
och rapporterar text som spiller över sin ruta, element utanför bilden
och för små marginaler.

```bash
pip install python-pptx Pillow
python3 qa_render.py School-OS-presentation.pptx qa.html
node qa_shoot.cjs
```

## Siffrorna

Priser, marknadsandelar och budgetposter är antaganden vi själva satt,
inte hämtade data. Elev- och skolantalen är ungefärliga och ska stämmas
av mot Skolverkets officiella statistik innan de används i ett skarpt
underlag. Bild 10 och 12 säger detta uttryckligen på bilden.
