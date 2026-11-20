import { describe, expect, it } from "vitest";
import { makeBarcodeLookup, OFF_FIELDS, OFF_USER_AGENT, offProductUrl } from "../lib/barcodeLookup";
import { loggableFromOff } from "../lib/mm/addFood";
import { barcodeDigits, barcodeShown, energyAgrees, offAnswerFrom, offAnswerFromOff, offLabel, scannedItemHref } from "../lib/mm/barcodes";

// Scan a barcode into the food diary (founder 2026-11-20): a barcode none of our lists holds is looked up at Open Food Facts through our own API, once a day, with our
// own name as the User-Agent, and every figure is checked before it is shown (CLAUDE.md rule 1: community numbers, said so; a figure that can't be right is left out).

const CORNFLAKES = {
  status: 1,
  product: {
    product_name: "Corn Flakes",
    brands: "Kellogg's, Kellogg",
    quantity: "500 g",
    serving_size: "30 g",
    image_front_url: "https://images.openfoodfacts.org/images/products/501/002/900/0001/front_en.12.400.jpg",
    nutriments: { "energy-kcal_100g": 378, proteins_100g: 7, carbohydrates_100g: 84, fat_100g: 0.9, "saturated-fat_100g": 0.2, sugars_100g: 8, fiber_100g: 3, salt_100g: 1.13 },
  },
};

describe("a barcode's digits as printed (the design review of 2026-11-20: 01318180 was shown as 1318180)", () => {
  it("keeps the leading zeros", () => {
    expect(barcodeDigits("01318180")).toBe("01318180");
    expect(barcodeDigits(" 0131-8180 ")).toBe("01318180");
    expect(barcodeDigits("1318180")).toBeNull();
    expect(barcodeDigits("baked beans")).toBeNull();
  });
  it("shows a code that lost its zeros on the way back at an EAN-8's 8 digits, and any other as given", () => {
    expect(barcodeShown("1318180")).toBe("01318180");
    expect(barcodeShown("01318180")).toBe("01318180");
    expect(barcodeShown("5010029000001")).toBe("5010029000001");
  });
  it("marks a product page reached by a scan", () => {
    expect(scannedItemHref({ shop: "asda", id: "123" })).toBe("/app/groceries/shop/item?r=asda&id=123&scan=1");
  });
});

describe("checking Open Food Facts' figures", () => {
  it("lets calories through that roughly agree with protein, carbs and fat", () => {
    expect(energyAgrees(378, 7, 84, 0.9, 3)).toBe(true); // corn flakes
    expect(energyAgrees(42, 0, 10.6, 0)).toBe(true); // cola
    expect(energyAgrees(0.4, 0, 0, 0)).toBe(true); // diet cola
    expect(energyAgrees(600, 25, 13, 50, 7)).toBe(true); // peanut butter
    expect(energyAgrees(334, 14, 48, 3.5, 27)).toBe(true); // bran, fibre counted
  });
  it("catches a slip: kJ as kcal, a lost digit, calories with nothing to make them", () => {
    expect(energyAgrees(1580, 7, 84, 0.9)).toBe(false);
    expect(energyAgrees(37.8, 7, 84, 0.9)).toBe(false);
    expect(energyAgrees(250, 0, 0, 0)).toBe(false);
  });

  const keys = { kcal: "k", protein: "p", carbs: "c", fat: "f", saturates: "s", sugars: "su", fibre: "fi", salt: "sa" };
  it("needs calories, protein, carbs and fat, none negative or more than 100 g can hold", () => {
    expect(offLabel({ k: 378, p: 7, c: 84, f: 0.9 }, keys)).toEqual({ kcal: 378, protein: 7, carbs: 84, fat: 0.9 });
    expect(offLabel({ k: "378", p: "7", c: "84", f: "0.9" }, keys)).toEqual({ kcal: 378, protein: 7, carbs: 84, fat: 0.9 });
    expect(offLabel({ k: 378, p: 7, c: 84 }, keys)).toBeNull();
    expect(offLabel({ k: 378, p: -7, c: 84, f: 0.9 }, keys)).toBeNull();
    expect(offLabel({ k: 950, p: 0, c: 0, f: 100 }, keys)).toBeNull();
    expect(offLabel({ k: 400, p: 60, c: 60, f: 0 }, keys)).toBeNull(); // 120 g in 100 g
    expect(offLabel({ k: 1580, p: 7, c: 84, f: 0.9 }, keys)).toBeNull(); // kJ typed as kcal: no figures at all
    expect(offLabel({ k: "lots", p: 7, c: 84, f: 0.9 }, keys)).toBeNull();
    expect(offLabel(null, keys)).toBeNull();
  });
  it("leaves out on its own a figure that can't be right, and rounds as labels print", () => {
    expect(offLabel({ k: 378.4, p: 7.04, c: 84, f: 0.9, s: 5, su: 90, fi: 3, sa: 1.126 }, keys)).toEqual({ kcal: 378, protein: 7, carbs: 84, fat: 0.9, fibre: 3, salt: 1.13 });
    expect(offLabel({ k: 378, p: 7, c: 84, f: 0.9, s: -1, sa: 120 }, keys)).toEqual({ kcal: 378, protein: 7, carbs: 84, fat: 0.9 });
  });
});

describe("Open Food Facts' answer as ours", () => {
  it("keeps the name, the first brand, the sizes, the checked figures and only its own front photo", () => {
    expect(offAnswerFromOff("05010029000001", CORNFLAKES)).toEqual({
      found: true,
      product: {
        code: "05010029000001", name: "Corn Flakes", brand: "Kellogg's", quantity: "500 g", serving: "30 g", per: "g",
        label: { kcal: 378, protein: 7, carbs: 84, fat: 0.9, saturates: 0.2, sugars: 8, fibre: 3, salt: 1.13 },
        image: "https://images.openfoodfacts.org/images/products/501/002/900/0001/front_en.12.400.jpg",
      },
    });
  });
  it("is per 100 ml for a drink, prefers the English name, drops a photo from anywhere else and strips control characters", () => {
    const a = offAnswerFromOff("5449000000996", { status: 1, product: { product_name: "Coca-Cola", product_name_en: "Coca\u0000-Cola\n Original", quantity: "330 ml", image_front_url: "https://evil.example/x.jpg", nutriments: { "energy-kcal_100g": 42, proteins_100g: 0, carbohydrates_100g: 10.6, fat_100g: 0 } } });
    expect(a.found && a.product.per).toBe("ml");
    expect(a.found && a.product.name).toBe("Coca -Cola Original");
    expect(a.found && a.product.image).toBeNull();
  });
  it("is found with no figures when they don't add up, and not found with neither a name nor figures", () => {
    const wrong = offAnswerFromOff("5000000000001", { status: 1, product: { product_name: "Mystery bar", nutriments: { "energy-kcal_100g": 1800, proteins_100g: 5, carbohydrates_100g: 60, fat_100g: 20 } } });
    expect(wrong).toEqual({ found: true, product: expect.objectContaining({ name: "Mystery bar", label: null }) });
    expect(offAnswerFromOff("5000000000001", { status: 1, product: { nutriments: {} } })).toEqual({ found: false });
    expect(offAnswerFromOff("5000000000001", { status: 0, status_verbose: "product not found" })).toEqual({ found: false });
    expect(offAnswerFromOff("5000000000001", "<html>")).toEqual({ found: false });
  });
  it("is checked again on the phone: our API's answer for another barcode, or with figures that can't be right, isn't one", () => {
    const ours = offAnswerFromOff("05010029000001", CORNFLAKES);
    const sent = JSON.parse(JSON.stringify(ours));
    expect(offAnswerFrom(sent, "05010029000001")).toEqual(ours);
    expect(offAnswerFrom(sent, "5010029000001")).toBeNull();
    expect(offAnswerFrom({ found: true, product: { ...sent.product, label: { kcal: 2000, protein: 7, carbs: 84, fat: 0.9 } } }, "05010029000001")).toBeNull();
    expect(offAnswerFrom({ found: true, product: { ...sent.product, image: "javascript:alert(1)" } }, "05010029000001")).toEqual({ found: true, product: { ...sent.product, image: null } });
    expect(offAnswerFrom({ found: false }, "05010029000001")).toEqual({ found: false });
    expect(offAnswerFrom("nope", "05010029000001")).toBeNull();
  });
  it("becomes a product to add, its community numbers said so, with its own serving and pack as the quick amounts", () => {
    const a = offAnswerFromOff("05010029000001", CORNFLAKES);
    if (!a.found) throw new Error("expected a product");
    const p = loggableFromOff(a.product, "Barcode 05010029000001");
    expect(p).toMatchObject({ key: "off:05010029000001", name: "Corn Flakes", brand: "Kellogg's", shop: null, per: "g", source: { kind: "community" }, size: "500 g", portion: "30 g", code: "05010029000001" });
    expect(p?.photos).toEqual([{ src: CORNFLAKES.product.image_front_url, from: "off", shop: "" }]);
    expect(loggableFromOff({ ...a.product, label: null }, "x")).toBeNull();
    expect(loggableFromOff({ ...a.product, name: "" }, "Barcode 05010029000001")?.name).toBe("Barcode 05010029000001");
  });
});

describe("GET /api/v1/barcode/{code} (lib/barcodeLookup.ts)", () => {
  function fakeOff(reply: () => Response | Promise<Response>) {
    const asked: Array<{ url: string; init?: RequestInit }> = [];
    let now = 1_000_000;
    const lookup = makeBarcodeLookup({
      fetch: (async (url: string, init?: RequestInit) => { asked.push({ url, init }); return reply(); }) as unknown as typeof fetch,
      now: () => now,
    });
    return { lookup, asked, later: (ms: number) => { now += ms; } };
  }
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  it("asks Open Food Facts for the barcode with only the fields we use, as Numbite (never anyone's email)", async () => {
    const { lookup, asked } = fakeOff(() => json(CORNFLAKES));
    const r = await lookup("05010029000001");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ found: true, product: { code: "05010029000001", name: "Corn Flakes" } });
    expect(asked).toHaveLength(1);
    expect(asked[0]!.url).toBe(offProductUrl("05010029000001"));
    expect(asked[0]!.url).toBe(`https://world.openfoodfacts.org/api/v2/product/05010029000001.json?fields=${OFF_FIELDS}`);
    expect((asked[0]!.init?.headers as Record<string, string>)["User-Agent"]).toBe(OFF_USER_AGENT);
    expect(OFF_USER_AGENT).toBe("Numbite/1.1 (+https://numbite.com)");
    expect(OFF_USER_AGENT).not.toMatch(/@/);
  });

  it("asks once a day per barcode, whatever its leading zeros, and answers each with the digits it was asked", async () => {
    const { lookup, asked, later } = fakeOff(() => json(CORNFLAKES));
    await lookup("05010029000001");
    const again = await lookup("5010029000001");
    expect(asked).toHaveLength(1);
    expect(again.body).toMatchObject({ product: { code: "5010029000001" } });
    later(23 * 3600_000);
    await lookup("05010029000001");
    expect(asked).toHaveLength(1);
    later(2 * 3600_000);
    await lookup("05010029000001");
    expect(asked).toHaveLength(2);
  });

  it("asks once when the same barcode is asked twice at once", async () => {
    const { lookup, asked } = fakeOff(() => json(CORNFLAKES));
    const [a, b] = await Promise.all([lookup("5010029000001"), lookup("5010029000001")]);
    expect(asked).toHaveLength(1);
    expect(a.body).toEqual(b.body);
  });

  it("keeps a barcode it doesn't have (404) for the day too", async () => {
    const { lookup, asked } = fakeOff(() => json({ status: 0, status_verbose: "product not found" }, 404));
    expect((await lookup("5000000000001")).body).toEqual({ found: false });
    expect((await lookup("5000000000001")).body).toEqual({ found: false });
    expect(asked).toHaveLength(1);
  });

  it("never keeps a failure: no connection, its server down, or not JSON", async () => {
    let reply: () => Response = () => { throw new Error("offline"); };
    const { lookup, asked } = fakeOff(() => reply());
    expect((await lookup("5000000000001")).status).toBe(502);
    reply = () => new Response("down", { status: 503 });
    expect((await lookup("5000000000001")).status).toBe(502);
    reply = () => new Response("<html>", { status: 200 });
    expect((await lookup("5000000000001")).status).toBe(502);
    reply = () => json(CORNFLAKES);
    expect((await lookup("5000000000001")).status).toBe(200);
    expect(asked).toHaveLength(4);
  });

  it("refuses anything but a barcode, without asking", async () => {
    const { lookup, asked } = fakeOff(() => json(CORNFLAKES));
    for (const bad of ["1318180", "abc", "123456789012345", "../../etc", ""]) expect((await lookup(bad)).status).toBe(400);
    expect(asked).toHaveLength(0);
  });

  it("stays under Open Food Facts' limit: at most 50 new barcodes a minute from this server", async () => {
    const { lookup, asked, later } = fakeOff(() => json(CORNFLAKES));
    for (let i = 0; i < 50; i++) expect((await lookup(`50000000${String(i).padStart(5, "0")}`)).status).toBe(200);
    expect((await lookup("5000000099999")).status).toBe(503);
    expect((await lookup("5000000000001")).status).toBe(200); // already kept: no new request
    expect(asked).toHaveLength(50);
    later(61_000);
    expect((await lookup("5000000099999")).status).toBe(200);
  });
});
