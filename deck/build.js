const pptx = require("pptxgenjs");
const fs = require("fs");
const path = require("path");

const SHOTS = path.join(__dirname, "shots");
const img = (n) => path.join(SHOTS, n);

// Palette taken from the product itself: the app's deep indigo ground, its
// accent blue, and the four Microsoft app marks it hosts.
const NAVY = "0E1428";
const NAVY_2 = "18203A";
const CARD = "F4F6FB";
const INK = "141A2C";
const MUTED = "5A6484";
const ICE = "C6D2EE";
const ACCENT = "5B87F5";
const WORD = "2B579A";
const EXCEL = "217346";
const PPT = "D24726";
const NOTE = "7719AA";

const HEAD = "Cambria";
const BODY = "Calibri";

const W = 13.3;
const H = 7.5;

const p = new pptx();
p.layout = "LAYOUT_WIDE";
p.author = "School OS";
p.company = "School OS";
p.title = "School OS — produkt, affärsplan och lansering";

// ---------- shared pieces ----------

// The square app mark from the product is the deck's repeating motif.
function badge(s, { x, y, size = 0.52, color = ACCENT, letter = "S", fontSize = 20 }) {
  s.addShape(p.ShapeType.roundRect, {
    x, y, w: size, h: size, rectRadius: 0.1, fill: { color },
  });
  s.addText(letter, {
    x, y, w: size, h: size, align: "center", valign: "middle", isTextBox: true,
    fontFace: BODY, fontSize, bold: true, color: "FFFFFF", margin: 0,
  });
}

// Reads the PNG header so every picture is placed at its true aspect ratio.
// Setting both w and h by hand is how a screenshot ends up squashed.
function pngSize(file) {
  const buf = fs.readFileSync(img(file));
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function pic(s, file, { x, y, w }) {
  const d = pngSize(file);
  const h = (w * d.h) / d.w;
  s.addImage({ path: img(file), x, y, w, h });
  return h;
}

function darkSlide() {
  const s = p.addSlide();
  s.background = { color: NAVY };
  return s;
}

function lightSlide(title, kicker) {
  const s = p.addSlide();
  s.background = { color: "FFFFFF" };
  if (kicker) {
    s.addText(kicker.toUpperCase(), {
      x: 0.62, y: 0.5, w: 8, h: 0.28, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 11, bold: true, color: ACCENT, charSpacing: 2,
    });
  }
  s.addText(title, {
    x: 0.62, y: kicker ? 0.8 : 0.55, w: 12.1, h: 0.75, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 34, bold: true, color: INK,
  });
  return s;
}

function card(s, { x, y, w, h, fill = CARD }) {
  s.addShape(p.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.05, fill: { color: fill },
    shadow: { type: "outer", color: "9AA6C4", blur: 10, offset: 2, angle: 90, opacity: 0.22 },
  });
}

// ============================================================
// 1. Title
// ============================================================
{
  const s = darkSlide();
  s.addShape(p.ShapeType.roundRect, {
    x: -2, y: -3.4, w: 11, h: 11, rectRadius: 0.06, fill: { color: NAVY_2 }, rotate: 22,
  });
  badge(s, { x: 0.9, y: 1.42, size: 0.86, letter: "S", fontSize: 34 });
  s.addText("School OS", {
    x: 0.9, y: 2.45, w: 8, h: 1.1, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 60, bold: true, color: "FFFFFF",
  });
  s.addText("Ett skolsystem där lektionen, läromedlet, dokumentet och\nsamtalet ligger i samma fönster.", {
    x: 0.9, y: 3.6, w: 7.6, h: 1.1, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 17, color: ICE, lineSpacing: 26,
  });
  s.addText("Produktintroduktion · Affärsplan · Budget · Distribution · Försäljning", {
    x: 0.9, y: 5.3, w: 8.5, h: 0.35, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 12, color: "8C9AC0", charSpacing: 1,
  });
  pic(s, "01-login-card.png", { x: 8.55, y: 1.6, w: 4.0 });
  s.addText("Fungerande prototyp · wlmrcarlsson-hue.github.io/Wproz", {
    x: 8.55, y: 4.62, w: 4.2, h: 0.3, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 10, color: "8C9AC0",
  });
  s.addNotes("School OS är byggt och kör som en fungerande prototyp i webbläsaren. Den här dragningen går igenom vad produkten är, hur den ska tjäna pengar, vad den kostar att bygga, hur den distribueras och hur vi säljer den.");
}

// ============================================================
// 2. Problem
// ============================================================
{
  const s = lightSlide("En skoldag utspridd över sex inloggningar", "Problemet");
  const items = [
    ["Läraren", "Schema i ett system, uppgifter i ett annat, omdömen i ett tredje. Ingen av dem pratar med varandra.", WORD],
    ["Eleven", "Anteckningar i Word, uppgiften i lärplattformen, läromedlet i en PDF, frågan till läraren i mejlen.", EXCEL],
    ["Föräldern", "Ser sällan mer än en betygsrad. Får sin bild av skolan via eleven.", PPT],
  ];
  items.forEach(([who, what, color], i) => {
    const y = 1.95 + i * 1.32;
    card(s, { x: 0.62, y, w: 6.3, h: 1.15 });
    badge(s, { x: 0.95, y: y + 0.28, size: 0.48, color, letter: who[0], fontSize: 18 });
    s.addText(who, {
      x: 1.6, y: y + 0.2, w: 5, h: 0.34, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 15, bold: true, color: INK,
    });
    s.addText(what, {
      x: 1.6, y: y + 0.58, w: 5.1, h: 0.72, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 12, color: MUTED, lineSpacing: 17,
    });
  });

  s.addShape(p.ShapeType.roundRect, {
    x: 7.35, y: 1.95, w: 5.35, h: 3.92, rectRadius: 0.04, fill: { color: NAVY },
  });
  s.addText("Kostnaden", {
    x: 7.75, y: 2.28, w: 4.5, h: 0.35, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 11, bold: true, color: ACCENT, charSpacing: 2,
  });
  s.addText("Tiden går åt till\natt byta flik", {
    x: 7.75, y: 2.7, w: 4.6, h: 1.1, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 27, bold: true, color: "FFFFFF", lineSpacing: 32,
  });
  s.addText(
    [
      { text: "Varje byte kostar uppmärksamhet, och varje system har sin egen inloggning, sitt eget utseende och sin egen logik.", options: { breakLine: true, paraSpaceAfter: 10 } },
      { text: "Ingen av delarna är dålig. Problemet är att de aldrig var tänkta att sitta ihop.", options: {} },
    ],
    {
      x: 7.75, y: 4.0, w: 4.55, h: 1.7, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 12.5, color: ICE, lineSpacing: 19,
    }
  );
  s.addNotes("Poängen: vi konkurrerar inte med Google Classroom eller Microsoft på funktion — vi konkurrerar på att allt ligger på samma yta.");
}

// ============================================================
// 3. Lösningen / översikt
// ============================================================
{
  const s = lightSlide("Ett fönster, fyra ytor, tre roller", "Lösningen");
  s.addText("School OS samlar schema, uppgifter, läromedel, dokument och kommunikation i ett gränssnitt med flikar som går att docka sida vid sida.", {
    x: 0.62, y: 1.55, w: 7.2, h: 0.85, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 14, color: MUTED, lineSpacing: 21,
  });
  pic(s, "11-split-c.png", { x: 0.62, y: 2.6, w: 7.2 });
  s.addText("Delad vy: dokumentet till vänster, chatten med eleven till höger.", {
    x: 0.62, y: 6.45, w: 7.2, h: 0.3, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 10.5, color: MUTED, italic: true,
  });

  const pillars = [
    ["Roller", "Lärare, elev och förälder ser olika appar och olika data — samma system."],
    ["Arbetsytan", "Word, Excel, PowerPoint och OneNote i en app-väljare på fliken."],
    ["Läromedel", "Böcker som läses som uppslag eller enkelsidor, direkt i vyn."],
    ["Delning", "Ett dokument skickas med ett meddelande och landar i rätt chatt."],
  ];
  s.addNotes("Nyckelbilden: den delade vyn. Lärarens eget dokument till vänster, elevens chatt till höger — det är hela produktidén i en bild.");

  pillars.forEach(([h, t], i) => {
    const y = 1.55 + i * 1.28;
    s.addText(h, {
      x: 8.2, y, w: 4.5, h: 0.32, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 14, bold: true, color: INK,
    });
    s.addText(t, {
      x: 8.2, y: y + 0.36, w: 4.5, h: 0.75, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 11.5, color: MUTED, lineSpacing: 16,
    });
  });
}

// ============================================================
// 4. Arbetsytan
// ============================================================
{
  const s = lightSlide("Fyra verktyg bakom en pil", "Funktion · Arbetsytan");
  pic(s, "02-switcher-c.png", { x: 0.62, y: 1.62, w: 6.55 });
  s.addText("Pilen på fliken öppnar app-väljaren. Fliken byter namn och ikon, och katalogen visar den valda appens filer.", {
    x: 0.62, y: 4.2, w: 6.55, h: 0.6, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 12, color: MUTED, lineSpacing: 17,
  });
  pic(s, "04-excel-strip.png", { x: 0.62, y: 4.92, w: 6.55 });

  const apps = [
    ["W", WORD, "Word", "Rik textredigerare med rubriker, listor och formatering."],
    ["X", EXCEL, "Excel", "Kalkylblad med formelfält: SUMMA, MEDEL, MIN, MAX, ANTAL och cellreferenser."],
    ["P", PPT, "PowerPoint", "Bildremsa med miniatyrer och en 16:9-yta för rubrik och innehåll."],
    ["N", NOTE, "OneNote", "Rityta med penna, sudd, fyllning, zoom och stående eller liggande sida."],
  ];
  apps.forEach(([letter, color, name, desc], i) => {
    const y = 1.62 + i * 1.14;
    card(s, { x: 7.55, y, w: 5.15, h: 1.0 });
    badge(s, { x: 7.85, y: y + 0.19, size: 0.44, color, letter, fontSize: 16 });
    s.addText(name, {
      x: 8.42, y: y + 0.13, w: 4, h: 0.3, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 13.5, bold: true, color: INK,
    });
    s.addText(desc, {
      x: 8.42, y: y + 0.45, w: 4.05, h: 0.6, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 10.5, color: MUTED, lineSpacing: 14,
    });
  });
  s.addNotes("Alla fyra är byggda och fungerar i prototypen. Formlerna räknas ut på riktigt.");
}

// ============================================================
// 5. Läromedel
// ============================================================
{
  const s = lightSlide("Läromedlet ligger i systemet, inte bredvid det", "Funktion · Ämnen");
  pic(s, "07-book-c.png", { x: 0.62, y: 1.68, w: 7.6 });
  s.addText("Boken bryts i riktiga spalter och sidas om som ett uppslag. I en delad vy växlar den automatiskt till enkelsida med egen scroll.", {
    x: 0.62, y: 5.85, w: 7.6, h: 0.6, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 12, color: MUTED, lineSpacing: 17,
  });

  s.addNotes("Läromedlet är den delen som kräver förlagsavtal. I prototypen finns en egen exempelbok som visar läsaren.");

  const facts = [
    ["Uppslag", "Två sidor sida vid sida, med marginal och bunt som i en tryckt bok."],
    ["Enkelsida", "Ett kapitel per sida, som alltid börjar överst — aldrig mitt i en mening."],
    ["Innehåll", "Kapitelnavigering, lässtatus och sparad position per bok."],
  ];
  facts.forEach(([h, t], i) => {
    const y = 1.78 + i * 1.5;
    s.addText(h, {
      x: 8.6, y, w: 4.1, h: 0.32, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 14, bold: true, color: INK,
    });
    s.addText(t, {
      x: 8.6, y: y + 0.36, w: 4.1, h: 0.9, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 11.5, color: MUTED, lineSpacing: 16,
    });
  });
}

// ============================================================
// 6. Delning
// ============================================================
{
  const s = lightSlide("Från elevens dokument till lärarens inkorg", "Funktion · Delning");
  pic(s, "08-send-c.png", { x: 0.62, y: 1.72, w: 5.9 });
  pic(s, "09-shared-strip.png", { x: 0.62, y: 4.78, w: 5.9 });

  s.addNotes("Poängen längst ner är den viktiga: en lärare ser bara det som skickats till just det kontot. Det är inte en inställning utan hur lagringen är byggd.");

  const steps = [
    ["1", "Eleven väljer mottagare", "Dokumentet erbjuder först den lärare vars ämne det tillhör."],
    ["2", "Skriver ett meddelande", "Texten läggs in som ett vanligt inlägg, dokumentet direkt under."],
    ["3", "Läraren öppnar det", "Filen stannar hos sin ägare — mottagaren får en skrivskyddad vy."],
  ];
  steps.forEach(([n, h, t], i) => {
    const y = 1.85 + i * 1.4;
    badge(s, { x: 7.1, y, size: 0.44, color: ACCENT, letter: n, fontSize: 17 });
    s.addText(h, {
      x: 7.72, y: y - 0.03, w: 5, h: 0.32, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 14, bold: true, color: INK,
    });
    s.addText(t, {
      x: 7.72, y: y + 0.33, w: 5, h: 0.8, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 11.5, color: MUTED, lineSpacing: 16,
    });
  });

  s.addShape(p.ShapeType.roundRect, {
    x: 7.1, y: 6.05, w: 5.6, h: 1.0, rectRadius: 0.06, fill: { color: NAVY },
  });
  s.addText("En konversation tillhör paret av konton — inte en av dem. Loggar du in som en annan lärare är samma elevs chatt tom.", {
    x: 7.4, y: 6.2, w: 5.0, h: 0.72, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 11, color: ICE, lineSpacing: 16, italic: true,
  });
}

// ============================================================
// 7. Roller
// ============================================================
{
  const s = lightSlide("Tre roller, tre olika system", "Funktion · Konton");
  s.addText("Kontot väljs vid inloggning och avgör allt: vilka flikar som finns, vilka data som visas och vem man kan prata med.", {
    x: 0.62, y: 1.55, w: 9, h: 0.5, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 14, color: MUTED,
  });

  s.addNotes("Rollerna är inte kosmetiska. Byter man konto byts flikar, data och kontakter ut.");

  const roles = [
    ["Lärare", WORD, ["Inlämningar för sitt eget ämne", "Elevlista och kollegielista", "Egen arbetsyta och egna filer", "Ser bara det som skickats till kontot"]],
    ["Elev", EXCEL, ["Uppgifter med egen status", "Alla lärare i chatten", "Arbetsyta med alla fyra appar", "Läromedel per ämne"]],
    ["Förälder", PPT, ["Följer sitt eget barn", "Barnets uppgifter och omdömen", "Kontakt med barnets lärare", "Ingen åtkomst till elevens filer"]],
  ];
  roles.forEach(([name, color, list], i) => {
    const x = 0.62 + i * 4.15;
    card(s, { x, y: 2.4, w: 3.85, h: 2.35 });
    badge(s, { x: x + 0.32, y: 2.68, size: 0.5, color, letter: name[0], fontSize: 19 });
    s.addText(name, {
      x: x + 0.95, y: 2.74, w: 2.7, h: 0.36, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 17, bold: true, color: INK,
    });
    s.addText(
      list.map((t, j) => ({ text: t, options: { bullet: true, breakLine: j < list.length - 1, paraSpaceAfter: 8 } })),
      {
        x: x + 0.35, y: 3.42, w: 3.2, h: 1.25, isTextBox: true, margin: 0,
        fontFace: BODY, fontSize: 11.5, color: MUTED, lineSpacing: 16,
      }
    );
  });
  pic(s, "10-submissions-strip.png", { x: 0.62, y: 5.3, w: 7.0 });
  s.addText("Lärarvyn: samma uppgift, alla elever i klassen — och bara det egna ämnet.", {
    x: 7.9, y: 5.7, w: 4.8, h: 0.7, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 12, color: MUTED, lineSpacing: 17, italic: true,
  });
}

// ============================================================
// 8. Section divider — affären
// ============================================================
{
  const s = darkSlide();
  s.addShape(p.ShapeType.roundRect, {
    x: 8.2, y: -2.2, w: 9, h: 9, rectRadius: 0.06, fill: { color: NAVY_2 }, rotate: 20,
  });
  badge(s, { x: 0.9, y: 2.5, size: 0.62, letter: "2", fontSize: 24 });
  s.addText("Affären", {
    x: 0.9, y: 3.3, w: 8, h: 1, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 48, bold: true, color: "FFFFFF",
  });
  s.addText("Affärsmodell · Marknad · Budget · Distribution · Försäljning", {
    x: 0.9, y: 4.35, w: 8, h: 0.4, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 14, color: ICE,
  });
}

// ============================================================
// 9. Affärsmodell
// ============================================================
{
  const s = lightSlide("Skolan betalar per elev och läsår", "Affärsplan");
  const tiers = [
    ["Bas", "39 kr", "per elev och läsår", ["Schema och uppgifter", "Roller och konton", "Kommunikation", "E-postsupport"], false],
    ["Full", "89 kr", "per elev och läsår", ["Allt i Bas", "Arbetsytan med fyra appar", "Läromedelshylla", "Delning och inlämning", "Support inom 24 h"], true],
    ["Kommun", "Offert", "från 20 000 elever", ["Allt i Full", "SSO och Skolfederation", "Egen datahantering", "Utbildning på plats", "Namngiven kontakt"], false],
  ];
  tiers.forEach(([name, price, unit, list, hero], i) => {
    const x = 0.62 + i * 4.15;
    if (hero) {
      s.addShape(p.ShapeType.roundRect, {
        x, y: 1.85, w: 3.85, h: 3.5, rectRadius: 0.04, fill: { color: NAVY },
        shadow: { type: "outer", color: "5A6484", blur: 12, offset: 3, angle: 90, opacity: 0.3 },
      });
    } else {
      card(s, { x, y: 1.85, w: 3.85, h: 3.5 });
    }
    const fg = hero ? "FFFFFF" : INK;
    const sub = hero ? ICE : MUTED;
    s.addText(name, {
      x: x + 0.35, y: 2.12, w: 3.2, h: 0.32, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 12, bold: true, color: hero ? ACCENT : ACCENT, charSpacing: 2,
    });
    s.addText(price, {
      x: x + 0.35, y: 2.5, w: 3.2, h: 0.7, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 36, bold: true, color: fg,
    });
    s.addText(unit, {
      x: x + 0.35, y: 3.2, w: 3.2, h: 0.3, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 11, color: sub,
    });
    s.addText(
      list.map((t, j) => ({ text: t, options: { bullet: true, breakLine: j < list.length - 1, paraSpaceAfter: 7 } })),
      {
        x: x + 0.35, y: 3.65, w: 3.2, h: 1.6, isTextBox: true, margin: 0,
        fontFace: BODY, fontSize: 11, color: sub, lineSpacing: 15,
      }
    );
  });
  s.addText("Priserna är satta av oss och ännu inte testade mot en köpare. De ska valideras i de första pilotsamtalen.", {
    x: 0.62, y: 5.55, w: 12.1, h: 0.3, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 10.5, color: MUTED, italic: true,
  });
  s.addNotes("Läsårsavtal, fakturering per termin. Uppgraderingen från Bas till Full är den viktigaste intäktsmotorn.");
}

// ============================================================
// 10. Marknad
// ============================================================
{
  const s = lightSlide("Marknaden vi räknar på", "Affärsplan · Marknad");
  const stats = [
    ["~380 000", "elever i svensk gymnasieskola"],
    ["~1 300", "gymnasieskolor"],
    ["290", "kommuner som huvudmän"],
  ];
  stats.forEach(([n, t], i) => {
    const x = 0.62 + i * 4.15;
    card(s, { x, y: 1.7, w: 3.85, h: 1.6 });
    s.addText(n, {
      x: x + 0.35, y: 1.9, w: 3.2, h: 0.72, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 34, bold: true, color: ACCENT,
    });
    s.addText(t, {
      x: x + 0.35, y: 2.62, w: 3.2, h: 0.5, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 11.5, color: MUTED, lineSpacing: 15,
    });
  });

  s.addNotes("Var tydlig med att detta är antaganden. Om någon frågar var siffrorna kommer ifrån: de ska verifieras mot Skolverket innan de används i ett skarpt underlag.");

  s.addText("Så räknar vi hem den", {
    x: 0.62, y: 3.6, w: 6, h: 0.36, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 15, bold: true, color: INK,
  });
  const funnel = [
    ["Total marknad", "380 000 elever × 89 kr", "34 Mkr per läsår"],
    ["Realistisk andel år 3", "3 % av eleverna", "1,0 Mkr per läsår"],
    ["Vad det betyder", "11 400 elever", "ca 30 skolor"],
  ];
  funnel.forEach(([a, b, c], i) => {
    const y = 4.08 + i * 0.62;
    s.addText(a, {
      x: 0.62, y, w: 2.9, h: 0.34, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 12, bold: true, color: INK,
    });
    s.addText(b, {
      x: 3.6, y, w: 2.6, h: 0.34, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 12, color: MUTED,
    });
    s.addText(c, {
      x: 6.3, y, w: 2.2, h: 0.34, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 12, bold: true, color: ACCENT,
    });
  });

  s.addShape(p.ShapeType.roundRect, {
    x: 9.05, y: 3.6, w: 3.65, h: 2.15, rectRadius: 0.04, fill: { color: NAVY },
  });
  s.addText("Läs siffrorna som antaganden", {
    x: 9.35, y: 3.85, w: 3.05, h: 0.6, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 13, bold: true, color: "FFFFFF", lineSpacing: 18,
  });
  s.addText("Elev- och skolantalen är ungefärliga och ska stämmas av mot Skolverkets officiella statistik innan de används skarpt. Andelen på 3 % är ett mål, inte en prognos.", {
    x: 9.35, y: 4.6, w: 3.05, h: 1.6, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 10.5, color: ICE, lineSpacing: 15,
  });
  s.addText("Avser gymnasiet i Sverige. Grundskolan (~1,1 miljoner elever) är en möjlig utvidgning, inte del av kalkylen.", {
    x: 0.62, y: 6.55, w: 8, h: 0.3, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 10, color: MUTED, italic: true,
  });
}

// ============================================================
// 11. Budget — kostnader
// ============================================================
{
  const s = lightSlide("Vad år 1 kostar att bygga", "Budget");
  s.addChart(
    p.ChartType.bar,
    [{
      name: "Kostnad år 1",
      labels: ["Utveckling", "Drift och hosting", "Sälj och marknad", "Juridik och GDPR", "Övrigt"],
      values: [1450, 120, 380, 150, 100],
    }],
    {
      x: 0.62, y: 1.65, w: 7.1, h: 4.3,
      barDir: "bar",
      chartColors: [ACCENT],
      showTitle: true, title: "Kostnader år 1 (tkr)", titleFontFace: BODY, titleFontSize: 13, titleColor: INK,
      showValue: true, dataLabelPosition: "outEnd", dataLabelFontFace: BODY,
      dataLabelFontSize: 10, dataLabelColor: MUTED,
      catAxisLabelFontFace: BODY, catAxisLabelFontSize: 11, catAxisLabelColor: MUTED,
      valAxisLabelFontFace: BODY, valAxisLabelFontSize: 10, valAxisLabelColor: MUTED,
      valGridLine: { color: "E4E8F2", size: 1 },
      catGridLine: { style: "none" },
      showLegend: false,
      barGapWidthPct: 45,
    }
  );

  s.addNotes("Största posten är utveckling: två utvecklare på deltid i tolv månader. Sälj och marknad är medvetet lågt — vi säljer via piloter, inte via annonsering.");

  const rows = [
    ["Utveckling", "1 450 tkr", "2 utvecklare på deltid, 12 mån"],
    ["Drift och hosting", "120 tkr", "Servrar, domän, backup, certifikat"],
    ["Sälj och marknad", "380 tkr", "Mässor, material, resor, pilotstöd"],
    ["Juridik och GDPR", "150 tkr", "Personuppgiftsbiträdesavtal, DPIA"],
    ["Övrigt", "100 tkr", "Bolag, försäkring, verktyg"],
  ];
  s.addText("Poster", {
    x: 8.0, y: 1.75, w: 4.7, h: 0.32, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 12, bold: true, color: ACCENT, charSpacing: 2,
  });
  rows.forEach(([a, b, c], i) => {
    const y = 2.2 + i * 0.78;
    s.addText(a, {
      x: 8.0, y, w: 3.1, h: 0.28, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 12, bold: true, color: INK,
    });
    s.addText(b, {
      x: 11.2, y, w: 1.5, h: 0.28, isTextBox: true, margin: 0, align: "right",
      fontFace: BODY, fontSize: 12, bold: true, color: ACCENT,
    });
    s.addText(c, {
      x: 8.0, y: y + 0.28, w: 4.7, h: 0.28, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 10.5, color: MUTED,
    });
  });
  s.addShape(p.ShapeType.roundRect, {
    x: 8.0, y: 6.1, w: 4.7, h: 0.72, rectRadius: 0.06, fill: { color: NAVY },
  });
  s.addText("Totalt år 1", {
    x: 8.3, y: 6.26, w: 2.4, h: 0.36, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 13, bold: true, color: "FFFFFF",
  });
  s.addText("2 200 tkr", {
    x: 10.3, y: 6.24, w: 2.1, h: 0.4, isTextBox: true, margin: 0, align: "right",
    fontFace: HEAD, fontSize: 18, bold: true, color: ACCENT,
  });
}

// ============================================================
// 12. Budget — intäkter och break-even
// ============================================================
{
  const s = lightSlide("Break-even under år 3", "Budget · Prognos");
  s.addChart(
    [
      {
        type: p.ChartType.bar,
        data: [
          { name: "Intäkter", labels: ["År 1", "År 2", "År 3", "År 4"], values: [180, 1250, 3400, 6800] },
          { name: "Kostnader", labels: ["År 1", "År 2", "År 3", "År 4"], values: [2200, 2900, 3300, 4200] },
        ],
        options: { chartColors: [ACCENT, "C8D2EA"], barGapWidthPct: 55 },
      },
    ],
    {
      x: 0.62, y: 1.6, w: 8.0, h: 4.7,
      showTitle: true, title: "Intäkter mot kostnader (tkr)", titleFontFace: BODY,
      titleFontSize: 13, titleColor: INK,
      showValue: true, dataLabelPosition: "outEnd", dataLabelFontFace: BODY,
      dataLabelFontSize: 9, dataLabelColor: MUTED,
      catAxisLabelFontFace: BODY, catAxisLabelFontSize: 11, catAxisLabelColor: MUTED,
      valAxisLabelFontFace: BODY, valAxisLabelFontSize: 10, valAxisLabelColor: MUTED,
      valGridLine: { color: "E4E8F2", size: 1 },
      catGridLine: { style: "none" },
      showLegend: true, legendPos: "b", legendFontFace: BODY, legendFontSize: 11, legendColor: MUTED,
    }
  );

  s.addNotes("Break-even under år 3 förutsätter att år 2 landar de första betalande avtalen. Blir det förskjutet ett år måste kassan täcka ytterligare cirka 3 miljoner.");

  const notes = [
    ["År 1", "2 pilotskolor, gratis", "Ingen intäkt att tala om — vi köper referenser."],
    ["År 2", "1 400 elever", "Första betalande avtalen, en kommun i pilot."],
    ["År 3", "3 800 elever", "Intäkterna passerar kostnaderna."],
    ["År 4", "7 600 elever", "Positivt kassaflöde, expansion till grundskolan."],
  ];
  notes.forEach(([a, b, c], i) => {
    const y = 1.72 + i * 1.2;
    s.addText(`${a} · ${b}`, {
      x: 8.85, y, w: 3.85, h: 0.3, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 12.5, bold: true, color: INK,
    });
    s.addText(c, {
      x: 8.85, y: y + 0.32, w: 3.85, h: 0.7, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 11, color: MUTED, lineSpacing: 15,
    });
  });
  s.addText("Modellen bygger på 89 kr per elev och läsår och de kundantal som anges. Byt en siffra och kurvan flyttar sig — den är till för att diskuteras, inte för att tros på.", {
    x: 0.62, y: 6.5, w: 12.1, h: 0.35, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 10.5, color: MUTED, italic: true,
  });
}

// ============================================================
// 13. Distribution
// ============================================================
{
  const s = lightSlide("Ingen installation, ingen app-butik", "Distribution");
  s.addText("School OS är en webbsida. Skolan får en adress, eleverna loggar in i den webbläsare de redan har, och uppdateringar når alla samtidigt.", {
    x: 0.62, y: 1.55, w: 8.5, h: 0.55, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 14, color: MUTED, lineSpacing: 20,
  });

  s.addNotes("Webben är också ett säljargument: ingen IT-avdelning behöver installera något, vilket tar bort ett vanligt hinder i skolan.");

  const channels = [
    ["1", "Webben", "Körs i webbläsaren på dator, Chromebook och surfplatta. Inget att installera, inget att uppdatera lokalt.", ACCENT],
    ["2", "Skolans egen adress", "skola.schoolos.se, eller på skolans domän. Data ligger i EU.", WORD],
    ["3", "Inloggning skolan redan har", "Koppling till Skolfederation och Microsoft/Google-konton, så ingen ny lösenordshantering.", EXCEL],
    ["4", "Uppdatering utan avbrott", "En version i drift. Rättningar når varje skola samma dag, utan IT-avdelningens hjälp.", PPT],
  ];
  channels.forEach(([n, h, t, color], i) => {
    const x = 0.62 + (i % 2) * 6.28;
    const y = 2.45 + Math.floor(i / 2) * 1.65;
    card(s, { x, y, w: 5.82, h: 1.42 });
    badge(s, { x: x + 0.32, y: y + 0.3, size: 0.46, color, letter: n, fontSize: 17 });
    s.addText(h, {
      x: x + 0.95, y: y + 0.26, w: 4.6, h: 0.34, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 14.5, bold: true, color: INK,
    });
    s.addText(t, {
      x: x + 0.95, y: y + 0.66, w: 4.6, h: 0.95, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 11.5, color: MUTED, lineSpacing: 16,
    });
  });
  s.addText("Prototypen ligger redan publikt på GitHub Pages — samma distributionsmodell, i mindre skala.", {
    x: 0.62, y: 6.65, w: 12.1, h: 0.3, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 10.5, color: MUTED, italic: true,
  });
}

// ============================================================
// 14. Go-to-market
// ============================================================
{
  const s = lightSlide("Vi säljer till läraren och stänger med rektorn", "Försäljning");
  const steps = [
    ["Läraren provar", "Gratis konto, ingen upphandling. En lärare som testar arbetsytan på en lektion är vår bästa säljare."],
    ["Skolan pilotar", "En termin gratis för en hel klass eller ett arbetslag. Vi mäter tid sparad och gör en kort rapport."],
    ["Rektorn köper", "Piloten blir underlag. Beslutet ligger under direktupphandlingsgränsen, så det går snabbt."],
    ["Kommunen skalar", "Med två till tre skolor som referens går vi till huvudmannen och tar hela kommunen."],
  ];
  steps.forEach(([h, t], i) => {
    const x = 0.62 + i * 3.12;
    s.addShape(p.ShapeType.roundRect, {
      x, y: 1.78, w: 2.82, h: 2.4, rectRadius: 0.04,
      fill: { color: i === 3 ? NAVY : CARD },
      shadow: { type: "outer", color: "9AA6C4", blur: 10, offset: 2, angle: 90, opacity: 0.22 },
    });
    badge(s, { x: x + 0.3, y: 2.06, size: 0.46, color: ACCENT, letter: String(i + 1), fontSize: 17 });
    s.addText(h, {
      x: x + 0.3, y: 2.66, w: 2.25, h: 0.58, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 14, bold: true, color: i === 3 ? "FFFFFF" : INK, lineSpacing: 18,
    });
    s.addText(t, {
      x: x + 0.3, y: 3.3, w: 2.25, h: 0.82, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 10.5, color: i === 3 ? ICE : MUTED, lineSpacing: 15,
    });
  });

  s.addText("Varför den vägen", {
    x: 0.62, y: 4.55, w: 5, h: 0.34, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 14, bold: true, color: INK,
  });
  s.addText(
    [
      { text: "En offentlig upphandling tar ett till två år och kräver referenser vi inte har än.", options: { bullet: true, breakLine: true, paraSpaceAfter: 7 } },
      { text: "En enskild skola kan köpa direkt så länge summan håller sig under direktupphandlingsgränsen.", options: { bullet: true, breakLine: true, paraSpaceAfter: 7 } },
      { text: "Lärare pratar med varandra: den bästa kanalen in i nästa skola är den förra skolans lärarrum.", options: { bullet: true } },
    ],
    {
      x: 0.62, y: 4.98, w: 7.6, h: 1.4, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 11.5, color: MUTED, lineSpacing: 16,
    }
  );

  s.addShape(p.ShapeType.roundRect, {
    x: 8.7, y: 4.55, w: 4.0, h: 1.6, rectRadius: 0.06, fill: { color: CARD },
  });
  s.addText("Mål år 1", {
    x: 9.0, y: 4.78, w: 3.4, h: 0.3, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 11, bold: true, color: ACCENT, charSpacing: 2,
  });
  s.addText("2 pilotskolor, 40 aktiva lärare, en dokumenterad tidsbesparing att sälja på.", {
    x: 9.0, y: 5.15, w: 3.4, h: 0.85, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 11.5, color: INK, lineSpacing: 16,
  });
}

// ============================================================
// 15. Risker
// ============================================================
{
  const s = lightSlide("Vad som kan fälla det här", "Risker");
  const risks = [
    ["Google och Microsoft är gratis för skolan", "Vi konkurrerar inte på funktion utan på att allt ligger på en yta. Håller inte det argumentet finns ingen affär.", "Hög"],
    ["Skolans inköp går långsamt", "Ett läsår kan gå mellan intresse och avtal. Kassan måste tåla det.", "Hög"],
    ["Personuppgifter om barn", "Skolan är personuppgiftsansvarig och kommer att granska oss hårt. GDPR-arbetet måste vara klart före första piloten, inte efter.", "Hög"],
    ["Läromedel kräver avtal", "Hyllan är tom utan förlagen. Alternativet är skolans eget material först.", "Medel"],
    ["Prototypen är inte en produkt", "Allt ligger i webbläsaren i dag. Konton, server och synk är kvar att bygga.", "Medel"],
  ];
  s.addNotes("Ta den här bilden själv innan någon annan gör det. Att kunna sina risker är det som skiljer en plan från en önskelista.");

  risks.forEach(([h, t, level], i) => {
    const y = 1.65 + i * 1.02;
    card(s, { x: 0.62, y, w: 12.1, h: 0.9 });
    s.addText(h, {
      x: 0.95, y: y + 0.13, w: 8.2, h: 0.3, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 13, bold: true, color: INK,
    });
    s.addText(t, {
      x: 0.95, y: y + 0.44, w: 9.9, h: 0.4, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 11, color: MUTED,
    });
    s.addShape(p.ShapeType.roundRect, {
      x: 11.35, y: y + 0.26, w: 1.05, h: 0.38, rectRadius: 0.12,
      fill: { color: level === "Hög" ? PPT : ACCENT },
    });
    s.addText(level, {
      x: 11.35, y: y + 0.26, w: 1.05, h: 0.38, isTextBox: true, margin: 0,
      align: "center", valign: "middle", fontFace: BODY, fontSize: 10, bold: true, color: "FFFFFF",
    });
  });
}

// ============================================================
// 16. Roadmap
// ============================================================
{
  const s = lightSlide("Från prototyp till första betalande skola", "Roadmap");
  const phases = [
    ["Klart", "Prototypen", "Roller och konton, arbetsytan med fyra appar, läromedelsläsare, delning, delad vy, fem UI-stilar.", true],
    ["Kv 1", "Backend", "Riktiga konton, server, synk mellan enheter, GDPR-arbetet och personuppgiftsbiträdesavtal."],
    ["Kv 2", "Pilot", "Två skolor, 40 lärare. Vi mäter användning och tid, och rättar det som skaver."],
    ["Kv 3", "Integrationer", "Skolfederation, Microsoft- och Google-inloggning, import av klasslistor."],
    ["Kv 4", "Första avtalen", "Betalande skolor, fakturering, support med utlovad svarstid."],
  ];
  s.addNotes("Allt på första raden är byggt och går att visa live. Det är det starkaste kortet vi har i ett pilotsamtal.");

  phases.forEach(([when, h, t, done], i) => {
    const y = 1.75 + i * 0.92;
    badge(s, { x: 0.62, y: y + 0.06, size: 0.44, color: done ? EXCEL : ACCENT, letter: done ? "✓" : String(i), fontSize: 15 });
    s.addText(when, {
      x: 1.25, y: y + 0.1, w: 1.0, h: 0.3, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 11.5, bold: true, color: done ? EXCEL : ACCENT,
    });
    s.addText(h, {
      x: 2.35, y: y + 0.06, w: 3.0, h: 0.34, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 14, bold: true, color: INK,
    });
    s.addText(t, {
      x: 5.3, y: y + 0.08, w: 7.4, h: 0.7, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 11.5, color: MUTED, lineSpacing: 16,
    });
  });
  s.addShape(p.ShapeType.roundRect, {
    x: 0.62, y: 6.5, w: 12.1, h: 0.62, rectRadius: 0.06, fill: { color: CARD },
  });
  s.addText("Allt under \"Klart\" går att prova i dag på wlmrcarlsson-hue.github.io/Wproz — det är inte en mockup.", {
    x: 0.95, y: 6.62, w: 11.5, h: 0.36, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 11.5, color: INK,
  });
}

// ============================================================
// 17. Avslut
// ============================================================
{
  const s = darkSlide();
  s.addShape(p.ShapeType.roundRect, {
    x: -3, y: 3.4, w: 11, h: 10, rectRadius: 0.06, fill: { color: NAVY_2 }, rotate: 18,
  });
  badge(s, { x: 0.9, y: 1.5, size: 0.7, letter: "S", fontSize: 28 });
  s.addText("Produkten finns.\nNu ska den säljas.", {
    x: 0.9, y: 2.4, w: 7.6, h: 1.7, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 42, bold: true, color: "FFFFFF", lineSpacing: 50,
  });
  s.addText("Vi söker två pilotskolor för höstterminen och 2,2 Mkr för att ta prototypen till en driftsatt produkt.", {
    x: 0.9, y: 4.35, w: 6.9, h: 0.9, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 15, color: ICE, lineSpacing: 23,
  });

  const asks = [["2", "pilotskolor"], ["2,2", "Mkr år 1"], ["12", "mån till avtal"]];
  asks.forEach(([n, t], i) => {
    const x = 8.0 + i * 1.55;
    s.addText(n, {
      x, y: 2.6, w: 1.5, h: 0.75, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 38, bold: true, color: ACCENT,
    });
    s.addText(t, {
      x, y: 3.4, w: 1.5, h: 0.6, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 11, color: ICE, lineSpacing: 14,
    });
  });
  s.addNotes("Avsluta med att visa prototypen live om det finns tid. Frågan tillbaka: vilken skola kan bli pilot nummer ett?");

  s.addText("wlmrcarlsson-hue.github.io/Wproz", {
    x: 0.9, y: 6.1, w: 8, h: 0.35, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 13, color: ACCENT,
  });
}

p.writeFile({ fileName: path.join(__dirname, "School-OS-presentation.pptx") }).then((f) => console.log("wrote", f));
