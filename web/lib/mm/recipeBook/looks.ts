// How each recipe looks from directly above, for its Midjourney picture prompt (docs/RECIPE_IMAGE_PROMPTS.md, tests/recipeImages.test.ts).
// Founder 2026-10-16: the recipe pictures are made with Midjourney and every one is a bird's-eye view. One or two plain sentences per recipe saying what the
// camera sees: the vessel, the components in their real arrangement, the colours and the textures the method really gives. Only foods that are in the recipe's
// own ingredients; never cutlery, hands, writing, packaging, brand names, steam or any claim about health. A test checks every recipe has one and the words.

import { EVERYDAY_BREAKFAST_LOOKS } from "./everydayBreakfast";
import { EVERYDAY_LUNCHES_LOOKS } from "./everydayLunches";
import { EVERY_SHOP_LOOKS } from "./everyShop";
import { FAST_MEALS_LOOKS } from "./fastMeals";
import { GLUTEN_FREE_LOOKS } from "./glutenFree";
import { HOME_SNACKS_LOOKS } from "./homeSnacks";
import { KETO_MEALS_LOOKS } from "./ketoMeals";
import { LONGEVITY_DINNERS_LOOKS } from "./longevityDinners";
import { LONGEVITY_MORNING_LOOKS } from "./longevityMorning";
import { MEDITERRANEAN_LOOKS } from "./mediterranean";
import { MORE_MAINS_LOOKS } from "./moreMains";
import { ONION_FREE_MEALS_LOOKS } from "./onionFreeMeals";
import { PALEO_MEALS_LOOKS } from "./paleoMeals";
import { PROTEIN_MEALS_LOOKS } from "./proteinMeals";
import { PROTEIN_MORNINGS_LOOKS } from "./proteinMornings";
import { QUICK_DINNERS_LOOKS } from "./quickDinners";
import { VEGAN_MAINS_LOOKS } from "./veganMains";
import { VEGAN_MORNING_LOOKS } from "./veganMorning";
import { WORLD_MEALS_LOOKS } from "./worldMeals";

export const RECIPE_LOOKS: Readonly<Record<string, string>> = {
  "overnight-oats": "Overnight oats in a wide shallow white bowl: a thick, pale oat and yogurt surface with a golden-brown spiral of peanut butter from the centre outwards, and a tight cluster of glossy deep red and purple mixed berries heaped on one side.",
  "cheesy-egg-wraps": "Two halves of a tortilla wrap rolled around soft yellow scrambled egg, dark green wilted spinach and melted orange cheddar, laid side by side on a pale wooden board with the cut ends showing the filling.",
  "berry-yogurt-porridge": "A round white bowl of thick, pale oat porridge, its surface topped with a dollop of thick white yogurt in the centre and a scatter of deep red and purple mixed berries around it.",
  "peanut-banana-porridge": "A shallow white bowl of thick, pale oat porridge with a swirl of golden-brown peanut butter through the middle, topped with overlapping round slices of banana arranged in a ring.",
  "smoked-salmon-eggs": "A round white plate holding a soft, glossy mound of pale yellow scrambled eggs with torn ribbons of pink-orange smoked salmon folded through, flecked with cracked black pepper.",
  "spanish-omelette": "A single thick wedge of Spanish-style omelette on a round white plate, its top turned golden brown with potato slices showing through, and cut sides that show golden potato slices, green peas and soft slices of onion held in firm egg.",
  "breakfast-burrito": "A burrito cut in half on a round white plate, the two halves side by side, the cut ends showing yellow scrambled egg, reddish-brown crushed kidney beans, green spinach, orange cheddar and red tomato salsa inside the wrap.",
  "bacon-egg-wraps": "One bacon and egg wrap cut in half on the diagonal, the two pieces laid as an angled pair on a white rectangular plate, the cut ends showing browned grilled bacon, yellow scrambled egg, dark green spinach and red tomato slices.",
  "greek-yogurt-granola": "A wide shallow white bowl of thick white yogurt, one half covered with golden-brown granola clusters and the other half with a heap of deep red and purple mixed berries, thin golden threads of honey crossing between them.",
  "cottage-cheese-berries": "A small deep white bowl of white, lumpy cottage cheese curds with a cluster of deep red and purple mixed berries in the centre, a golden spiral of honey over them and roughly chopped almonds scattered over the curds.",
  "wheat-biscuits-berries": "Two oblong wheat biscuits, pale golden-beige with a fine shredded texture, sit in a round white bowl in pale milk that shows around them, topped with a scatter of deep red and purple mixed berries.",
  "shakshuka": "A white oval dish of thick orange-red tomato sauce speckled with pieces of softened onion and red pepper, with two eggs set into it, the whites opaque and the yolks bright yellow.",
  "beans-poached-eggs": "A round white soup plate of baked beans in glossy orange-red tomato sauce with wilted dark green spinach through it, two poached eggs with set whites and bright yellow yolks resting on top, and cracked black pepper.",
  "ham-cheese-omelette": "A folded half-moon omelette on a white square plate, golden brown in patches on top, with melted orange cheddar and torn pieces of pink ham just showing at the open edge.",
  "mushroom-bean-breakfast-wraps": "Two halves of a rolled tortilla wrap laid side by side on a white oval plate, the cut ends showing orange-red baked beans, golden-brown sliced mushrooms and dark green wilted spinach.",
  "oat-pancakes": "A stack of several small round, golden-brown oat pancakes on a round white plate, with a dollop of thick white yogurt on top and deep red and purple mixed berries scattered over and around them.",
  "huevos-rancheros": "A flat round tortilla wrap on a round white plate, spread with reddish-brown crushed kidney beans and topped with two fried eggs, white with bright yellow yolks, with red tomato salsa spooned over and around them.",
  "bircher-muesli": "Bircher muesli in a deep round pale grey bowl: creamy pale soaked oats flecked with coarsely grated apple and dark raisins, with roughly chopped almonds scattered over the top.",
  "smoked-salmon-kedgeree": "Smoked salmon kedgeree in a shallow white bowl: golden curry-tinted rice dotted with green peas and soft slices of onion, with ribbons of pink smoked salmon and boiled egg halves with set yellow yolks laid on top.",
  "bean-potato-hash": "Bean and potato hash on a wide white round plate: golden, crisp-edged halved new potatoes, pieces of red pepper and softened onion dusted orange-brown with spices, dark red kidney beans mixed through, and chunky red tomato salsa spread over the top.",
  "chicken-wraps": "One chicken and yogurt wrap cut in half, the two halves leaning together in a V on a round white plate, the cut ends facing outwards and showing browned chicken slices, green lettuce, white yogurt and orange grated cheddar.",
  "chickpea-houmous-wraps": "One chickpea and houmous wrap cut in half on the diagonal on a pale wooden board, one half resting across the other, the cut ends showing beige houmous, spice-dusted chickpeas, green lettuce and red tomato slices inside a soft pale wrap.",
  "tuna-sweetcorn-pasta-salad": "Tuna and sweetcorn pasta salad heaped in a shallow round white bowl: pasta shapes coated in creamy mayonnaise, with flakes of pale pink tuna, yellow sweetcorn kernels, thin rings of green spring onion and flecks of black pepper.",
  "chicken-caesar-wraps": "One barbecue chicken and red pepper wrap cut in half and laid head to tail on a pale grey round plate, the cut ends showing glossy dark-glazed chicken strips, red pepper strips, green lettuce and orange grated cheddar inside a soft pale wrap.",
  "mushroom-wrap-pizzas": "One round wrap pizza cut into wedges on a pale wooden board, spread with red passata and topped with sliced brown mushrooms and torn white mozzarella melted into creamy white patches, with crisp edges and a sprinkle of dried oregano.",
  "mexican-bean-rice-bowl": "Mexican bean and rice bowl in a wide white round bowl, filled in sections: white rice, dark kidney beans with yellow sweetcorn, shredded green lettuce, a patch of red salsa, and orange grated cheddar scattered over the top.",
  "smoked-salmon-soft-cheese-wraps": "One smoked salmon and soft cheese wrap cut in half at a slant and set side by side on a white square plate, the cut ends showing white soft cheese, pink smoked salmon, green cucumber sticks and a few salad leaves inside a soft pale wrap.",
  "egg-mayonnaise-wraps": "One egg mayonnaise wrap cut into two halves, one half overlapping the other in a short diagonal row on a pale wooden board, the cut ends showing a creamy mash of yellow and white egg with green spring onion flecks and salad leaves.",
  "ham-soft-cheese-wraps": "One ham and soft cheese wrap, toasted with brown spots and cut in half, the halves set side by side and slightly staggered on a white oval plate, the cut ends showing pink ham, white soft cheese, red tomato slices and green salad leaves.",
  "chickpea-tomato-salad": "Chickpea, cucumber and tomato salad in a shallow white bowl: pale golden chickpeas mixed with chunks of green-edged cucumber, red tomato wedges and thin short slivers of purple red onion, glistening with a thin olive oil dressing.",
  "pesto-pasta-mozzarella-salad": "Pesto pasta salad in a wide white pasta bowl: pasta shapes coated in green pesto, halved red cherry tomatoes and torn pieces of white mozzarella scattered over, with a few green salad leaves tucked on top.",
  "sweet-chilli-chicken-noodle-salad": "Sweet chilli chicken noodle salad in a wide shallow white bowl: pale noodles tossed with orange grated carrot and cucumber sticks in a glossy red-orange glaze, topped with browned chicken slices fanned across one side and rings of green spring onion.",
  "chickpea-rice-bowl": "Sweet chilli chickpea rice bowl in a shallow white bowl: a bed of white rice topped in the centre with a heap of golden chickpeas glazed glossy dark with soy and sweet chilli, ringed by green peas, small cucumber chunks and spring onion rings.",
  "sweetcorn-potato-soup": "Chunky sweetcorn and potato soup in a deep round white bowl: a golden-yellow surface tinted orange by paprika, with whole yellow sweetcorn kernels and neat cubes of pale potato showing through, a faint sheen of oil and black pepper specks.",
  "chicken-sweetcorn-soup": "Chicken and sweetcorn soup in a shallow white bowl: a pale golden broth holding soft shreds of white chicken, yellow sweetcorn kernels and thin ribbons of set egg, topped with rings of green spring onion and flecks of black pepper.",
  "bean-tomato-soup": "Bean and tomato soup in a wide white rimmed soup plate: a smooth, thick, deep red-orange surface blended from kidney beans and tomatoes, with a faint sheen of olive oil and a scatter of black pepper specks.",
  "tuna-bean-salad": "Tuna and bean salad heaped in a shallow white bowl: dark red kidney beans mixed with large pale flakes of tuna, thin purple red onion slices and halved cherry tomatoes, all glossy with a thin dressing and flecked with black pepper.",
  "potato-egg-salad": "A round white plate spread with green salad leaves, topped with halved small new potatoes and green peas coated in a pale creamy dressing speckled with mustard seeds, and boiled egg halves on top with their set yellow yolks showing.",
  "cheese-bean-quesadillas": "A pale wooden board holding one quesadilla cut into wedges, the toasted wrap golden brown with darker spots and the cut edges showing melted yellow cheese, red-brown mashed beans and green spring onion, with a small heap of salad leaves beside it.",
  "curried-rice-salad": "Curried rice salad in a shallow white bowl: separate yellow-tinged rice grains dotted with diced red pepper, thin green spring onion slices and dark raisins, with roughly chopped almonds scattered across the top.",
  "chicken-mushroom-noodle-soup": "A wide white soup bowl filled with clear golden-brown broth, its surface covered with tangled noodles, soft shreds of chicken and thick slices of browned mushroom, finished with a scatter of slanted spring onion pieces.",
  "chicken-rice-bowl": "A wide shallow white bowl with fluffy white rice heaped on one side and, beside it, browned chicken strips tossed with long strips of red, green and orange pepper, all coated in a glossy dark soy glaze.",
  "chicken-curry": "A white oval plate holding a creamy orange curry with golden chunks of chicken and soft pieces of onion on one side, and a neat mound of white rice on the other.",
  "beef-chilli": "A deep round white bowl filled with thick deep red-brown chilli of crumbled beef mince, dark red kidney beans and soft pieces of onion in tomato sauce, with a half-moon of fluffy white rice tucked against one side of the rim.",
  "chicken-mushroom-pasta": "A wide white pasta bowl heaped with pasta shapes in a pale creamy sauce, with bite-sized pieces of golden chicken, sliced brown mushrooms and wilted dark green spinach through it, flecked with black pepper.",
  "salmon-noodles": "A shallow white bowl of soy-darkened noodles in a loose nest, topped with large flakes of pink-orange salmon with browned edges and a scatter of thin green spring onion slices.",
  "tuna-pasta": "A round white plate with a wide rim holding pasta shapes in a smooth red tomato sauce speckled with dried herbs, pale flakes of tuna through it and coarsely grated yellow cheddar sprinkled over the top, just starting to melt.",
  "salmon-coconut-curry": "A round white plate with a raised rim: white rice on one side, and on the other a creamy pale orange coconut curry sauce holding large chunks of pink salmon and bright green peas.",
  "satay-egg-noodles": "A wide white bowl of noodles glossy with a tan-brown peanut sauce, tossed with stir-fried beansprouts, shredded cabbage and strips of carrot and pepper, topped with wide ribbons of pale yellow omelette laid loosely across the surface.",
  "chickpea-curry": "A wide white pasta bowl with a round dome of white rice in the centre, ringed by thick orange-red tomato and coconut curry full of golden chickpeas, dark green wilted spinach and soft pieces of onion.",
  "bean-chilli": "A wide shallow white bowl divided on the diagonal: white rice on one side and, on the other, a deep red chunky chilli of dark red kidney beans, pale golden chickpeas and soft pieces of onion in thick tomato sauce.",
  "tuna-fishcakes": "A round white plate with two flat, round, golden-brown fishcakes side by side, crisp on top and flecked with green spring onion, and a small heap of bright green peas on the other side.",
  "mushroom-bean-pasta": "A shallow round white bowl of pasta shells in a chunky red tomato sauce with pieces of tomato, thick slices of brown mushroom, dark red kidney beans and small squares of soft onion, speckled with dried herbs.",
  "chicken-bean-rice": "A wide round white bowl heaped with sticky orange-red tomato and paprika rice, browned pieces of chicken thigh and dark red kidney beans sitting on the surface among soft pieces of onion.",
  "chicken-jalfrezi": "Chicken jalfrezi with rice on a wide white plate: a neat mound of white rice beside a glossy orange-red tomato sauce holding golden-orange spiced chicken chunks, large pieces of red and yellow pepper and soft curved petals of onion.",
  "beef-keema-peas": "Beef keema with peas and rice on a white square plate: a neat dome of white rice in the centre ringed by rich red-brown tomato sauce full of finely crumbled spiced beef mince, bright green peas and small pieces of soft onion.",
  "egg-pea-curry": "Egg and pea curry in a wide shallow white bowl: halved boiled eggs with set yellow yolks lie cut side up in an orange-red tomato sauce dotted with green peas, with a mound of white rice at one side.",
  "kidney-bean-curry": "A wide white soup plate with a bed of white rice covered by glossy dark red kidney beans and soft pieces of onion in a thick, spiced orange-red tomato sauce, a white crescent of rice showing along one edge.",
  "chicken-chow-mein": "Chicken chow mein in a wide white pasta bowl: a tangled heap of glossy soy-brown noodles mixed with browned chicken strips and colourful strips of stir-fried vegetables, with sliced green spring onion scattered across the top.",
  "sticky-beef-noodles": "Sticky soy beef noodles in a deep white bowl: a loose swirl of glossy dark-brown noodles with a heap of crumbled browned beef mince in the centre, large broccoli florets and wide red pepper strips around it, and sliced green spring onion on top.",
  "sweet-chilli-chicken": "Sweet chilli chicken stir-fry on a round white plate: a neat mound of white rice beside strips of chicken glazed in glossy red-orange sweet chilli sauce, mixed with red pepper strips, broccoli florets and pieces of green spring onion.",
  "spiced-chicken-naan": "Spiced yogurt chicken with naan on a large round white platter: golden-orange chicken chunks with browned edges, roasted red and yellow pepper pieces and onion wedges in a single layer, and one soft naan bread with pale blistered spots alongside.",
  "chicken-fajitas": "Chicken fajitas with salsa on a pale wooden board: two tortilla wraps toasted with brown spots and rolled into cones, the open ends showing browned chicken strips, strips of red and yellow pepper and onion, chunky red tomato salsa and white yogurt.",
  "beef-burrito-bowl": "Beef burrito bowl in a wide shallow white bowl: a base of white rice with crumbled spiced beef mince in the centre under a spoonful of red tomato salsa, beside a pile of dark red kidney beans mixed with yellow sweetcorn and a heap of shredded green lettuce.",
  "chicken-shawarma-wraps": "Chicken shawarma-style wraps on a long white platter: two tortilla wraps toasted with brown spots, rolled and lying side by side, their open top ends showing charred chicken pieces, torn green lettuce, tomato slices, cucumber half-moons and white garlic yogurt.",
  "chickpea-potato-curry": "Chickpea and potato curry in a wide shallow white bowl: pale golden chickpeas and halved new potatoes in a creamy orange coconut and tomato sauce, dark green wilted spinach folded through, with a mound of white rice at one side.",
  "soy-honey-salmon-bowl": "Soy and honey salmon rice bowl in a shallow white bowl: large flaked pieces of salmon with a glossy dark glaze caramelised at the edges and pink-orange flesh on a bed of white rice, with broccoli florets and round cucumber slices alongside and slanted spring onion on top.",
  "egg-fried-rice": "Egg fried rice with peas in a round white bowl: a heaped surface of rice tinted pale brown by soy, mixed with small pieces of yellow scrambled egg and green peas and flecked with sliced green spring onion.",
  "vegetable-almond-stir-fry": "Vegetable and almond stir-fry in a wide white pasta bowl: white rice as a bed, covered on one half by glossy broccoli florets, red pepper strips and orange carrot slices in a red-orange glaze, with chopped golden almonds and sliced spring onion over them.",
  "mexican-chicken-rice": "Mexican chicken and bean rice in a shallow round white dish: orange-red tomato-tinted rice with browned chicken chunks, dark red kidney beans, and pieces of onion and red pepper mixed through, filling the dish edge to edge.",
  "bean-pepper-fajitas": "Bean and pepper fajitas on a white rectangular plate: two rolled tortilla wraps side by side, the filling just showing at one end of each: soft strips of red and yellow pepper, onion, dark red kidney beans and red tomato salsa.",
  "moroccan-chickpea-stew": "Moroccan-style chickpea stew on a wide white plate with a rim: thick red-brown stew heaped in the centre, crowded with pale golden chickpeas, orange carrot pieces and plump dark raisins, with a ring of white rice around it.",
  "egg-chow-mein": "A round white plate piled with egg chow mein: glossy soy-browned noodles tangled with shredded stir-fry vegetables in green, orange and cream strands, with pale yellow pieces of scrambled egg showing across the top and sliced spring onion rings.",
  "egg-tomato-stir-fry": "A shallow white bowl with a bed of white rice showing at the edge under soft pale yellow scrambled egg folded through glossy red tomato pieces that have broken down into a thick sauce, scattered with sliced spring onion rings.",
  "chinese-style-chicken-curry": "A wide white plate with a straight band of white rice along one side and, beside it, a thick golden-yellow curry holding bite-sized pale gold pieces of chicken, soft curved petals of onion and bright green peas.",
  "spiced-chicken-rice-bowl": "A wide round white bowl with white rice in the middle, topped with golden chicken chunks coated in orange-red spices, neat piles of diced cucumber and red tomato to one side, and a dollop of white yogurt.",
  "chickpea-spinach-egg-stew": "A wide white bowl of thick red tomato stew crowded with pale chickpeas and dark green wilted spinach, with two eggs, their whites set and their yolks bright yellow, resting side by side on the surface.",
  "spaghetti-bolognese": "A wide round white plate holding a nest of spaghetti topped with a mound of thick red-brown beef and tomato sauce dotted with small cubes of orange carrot, grated cheddar heaped over the centre and a few spaghetti strands curling out at the edge.",
  "beef-pasta-bake": "A round white plate holding a spooned serving of cheesy beef pasta bake: pasta shapes in red beef sauce under a golden, bubbling layer of melted mozzarella and creamy cheese sauce with browned patches.",
  "cottage-pie": "A white square plate holding a spooned serving of cottage pie: a golden-browned ridged mashed potato top with melted cheddar patches, and the savoury beef mince filling with green peas and cubes of orange carrot showing at one side.",
  "chicken-mozzarella-pasta-bake": "A small white rectangular baking dish of pasta shapes and bite-sized chicken pieces in red tomato sauce with dark green wilted spinach, under a golden bubbling layer of melted mozzarella with a few browned spots.",
  "salmon-new-potatoes-peas": "A white oval plate with one baked salmon fillet, its top golden and glossy and its sides pink-orange with paler flaking lines, beside a pile of small new potatoes shining with oil and a heap of bright green peas.",
  "pesto-salmon-crushed-potatoes": "A wide round white plate with one salmon fillet under a spread of green pesto, a few roasted red cherry tomatoes beside it, roughly crushed skin-on potatoes with a glossy sheen of olive oil, and a few broccoli florets on long stalks.",
  "ham-egg-potatoes": "A large white plate with two fried eggs, set whites and golden yolks, folded slices of pink ham, halved crispy golden potatoes and a pile of green peas, with a small dab of yellow mustard at the edge.",
  "chicken-thigh-potato-traybake": "A white oval baking dish holding a portion of traybake: two golden-brown roast chicken thighs, halved roast potatoes with browned edges, red onion wedges and red pepper pieces, all dusted orange-red with paprika.",
  "potato-tomato-mozzarella-bake": "A small white oval baking dish of halved potatoes, golden on their cut sides, in a red tomato sauce, covered by melted mozzarella that is golden and bubbling in places, with the red sauce showing between the patches of cheese.",
  "easy-macaroni-cheese": "A small round white baking dish of macaroni cheese, its surface a golden-brown grilled layer of melted cheddar with darker toasted patches and slices of red tomato laid across the top, creamy elbow macaroni visible at the edge.",
  "bacon-carbonara-spaghetti": "A shallow round white bowl holding a nest of spaghetti coated in a creamy pale yellow egg and cheese sauce, with golden-brown bacon strips scattered through, grated cheddar on top and flecks of black pepper.",
  "beef-meatballs-spaghetti": "A deep white plate holding a nest of spaghetti topped with several round browned meatballs, all coated in a thick red tomato sauce that pools around the edges, with dried herb flecks showing in the meatballs.",
  "salmon-fish-pie": "A small white square baking dish of salmon fish pie, its top a golden-browned layer of mashed potato with melted cheddar, one corner broken open to show pink salmon chunks and green peas in a creamy sauce.",
  "bean-cottage-pie": "A small round white pie dish of bean and mushroom cottage pie, its golden-brown mashed potato top covering the dish, one corner scooped away to show a rich red filling of kidney beans, peas, mushrooms and diced carrot.",
  "chicken-chickpea-stew": "Chicken and chickpea stew in a wide white pasta bowl: browned chicken chunks with a red-brown paprika crust, round chickpeas and soft curved strips of onion in an orange-red paprika and tomato sauce, with dark green wilted spinach stirred through the surface.",
  "bacon-tomato-linguine": "Bacon and tomato linguine in a wide white pasta bowl: a loose nest of linguine coated in glossy red tomato sauce, golden bacon strips mixed through it and showing at the surface, with a speckling of black pepper.",
  "chickpea-potato-traybake": "A roasted traybake on a wide white oval plate: golden halved potatoes, browned chickpeas, chunks of red and yellow pepper with softened edges, red onion quarters and halved cherry tomatoes roasted cut side up, all coloured orange-red with paprika and cumin.",
  "minestrone-beans-pasta": "A shallow white bowl of thick minestrone, its round surface an orange-red tomato broth crowded with small elbow macaroni, red kidney beans, green peas, small cubes of orange carrot and onion, flecked with dried herbs.",
  "chicken-pepper-kebabs": "One rolled wrap on a pale wooden board, its open end showing golden grilled chicken chunks, squares of red and yellow pepper, pieces of red onion with browned edges and a thick white yogurt dressing inside.",
  "bbq-chicken-thigh-skewers": "Two skewers of dark, sticky, glossy barbecue-glazed chicken thigh chunks beside a mound of corn salad on a wide white oval plate: yellow sweetcorn, halved red cherry tomatoes, diced cucumber and thin green spring onion rings.",
  "peanut-butter-oat-bites": "Three round, matte, golden-tan balls of peanut butter and oats, flecked with oat flakes and dark raisins, sitting together on a small plain white round plate.",
  "houmous-veg-sticks": "A pale wooden board with a small white bowl of smooth beige houmous in the middle, and orange carrot sticks, pale green cucumber sticks and red pepper strips arranged in neat groups around it.",
  "honey-almond-yogurt-pots": "A small round white ramekin of thick, creamy white yogurt, with roughly chopped almonds scattered evenly over the top and a thin zigzag of glossy amber honey drizzled across them.",
  "frozen-yogurt-berry-bark": "Four jagged shards of frozen yogurt bark, creamy off-white with a frosted surface, studded with red, purple and deep blue berries pressed into the top, overlapping loosely on a pale grey round plate.",
  "ham-soft-cheese-roll-ups": "Three tight rolls of pink ham lying side by side on a small white round plate, each rolled end showing a white spiral of soft cheese around a pale green cucumber core.",
  "devilled-eggs": "Four boiled egg halves in a tidy row on a white oval plate, each white hollow piled with a creamy pale yellow filling and dusted with orange-red paprika.",
  "tuna-chickpea-dip": "A round white platter with a shallow white bowl of speckled beige dip in the middle, showing pale tuna flakes and thin green spring onion rings, and orange carrot, pale green cucumber and red pepper sticks arranged around it.",
  "smoked-salmon-cucumber-bites": "Six thick cucumber rounds with green skin edges arranged in a ring on a round white plate, each spread with white soft cheese, topped with a folded pink-orange ribbon of smoked salmon and cracked black pepper.",
  "crispy-spiced-chickpeas": "A small shallow white bowl heaped with roasted chickpeas, golden-brown and rough-skinned, coated in orange-red paprika and cumin with a faint gloss of oil and a few white salt flecks.",
  "paprika-roasted-almonds": "A small white square dish with whole roasted almonds spread in a loose single layer, deep golden-brown and coated in orange-red paprika, with a slight oily sheen and a few white salt flecks.",
  "cheese-bean-quesadilla-wedges": "Two triangular wedges of toasted folded wrap fanned on a white round plate, golden-brown with darker toasted spots, the cut sides showing melted orange cheddar, red salsa and green spring onion.",
  "turkey-roast-parsnips-sprouts": "A large white oval plate showing whole white-golden roast turkey fillets on one side, golden-brown honey-glazed parsnip fingers and crisp roast potatoes in the middle, a heap of bright green halved sprouts on the other side and a small bowl of deep red cranberry sauce at the edge.",
  "turkey-cranberry-cheddar-wraps": "Two tortilla wraps each cut in half on the diagonal and leaning together on a pale wooden board, the cut ends showing pale golden turkey strips, a ribbon of deep red cranberry sauce, grated orange cheddar and green lettuce.",
  "chipolatas-red-cabbage-mash": "A wide white round plate with a mound of smooth pale mash on one side, a pile of soft, glossy deep purple-red cabbage beside it, and a row of glossy, sticky honey-glazed chipolata sausages laid across the top, with a small spoonful of yellow mustard at the edge.",
  "gammon-parsnips-apple-sauce": "A round white plate with one pink-edged gammon steak with golden-brown seared surfaces, a row of caramelised honey-roast parsnip fingers beside it, a small heap of bright green peas, and small bowls of pale golden apple sauce and yellow mustard at the rim.",
  "sprout-chestnut-potato-gratin": "A rectangular white ovenproof dish seen from above, filled with a bubbling golden-brown cheddar crust, with dark green sprout halves, pale brown chestnut halves and slices of cream potato in a creamy sauce showing through at the edges.",
  "spiced-parsnip-apple-soup": "A round white shallow bowl of completely smooth, thick, pale cream-beige parsnip and apple soup with a faint golden tinge from the roasted parsnips and a few fine specks of black pepper across the surface.",
  "red-cabbage-chestnut-cranberry-rice": "A wide shallow white bowl of fluffy rice tinted pink-purple by red cabbage ribbons, studded with whole pale brown chestnuts, chunks of red-skinned apple and glossy deep red dried cranberries.",
  "mince-pie-porridge": "A round white bowl of thick, creamy pale oat porridge with a dollop of white yogurt in the middle, a spoonful of dark glossy mincemeat on top of the yogurt and roughly chopped almonds scattered over and around it.",
  "cranberry-cheddar-ham-toasted-wraps": "One golden-brown toasted filled wrap cut into wedges and fanned out on a pale wooden board, the cut edges showing melted orange cheddar, pink ham, thin green spring onion rings and a streak of deep red cranberry sauce.",
  // the four files added 2026-11-16 keep their looks next to their recipes
  ...VEGAN_MORNING_LOOKS,
  ...VEGAN_MAINS_LOOKS,
  ...GLUTEN_FREE_LOOKS,
  ...MORE_MAINS_LOOKS,
  ...EVERYDAY_BREAKFAST_LOOKS,
  // founder 2026-11-20, 22:25 ("make the most longevity-backed diet ... that's the one that I want to see")
  ...LONGEVITY_MORNING_LOOKS,
  ...LONGEVITY_DINNERS_LOOKS,
  // founder 2026-11-20, 22:00 ("Give more options like keto or whatever ... make new recipes")
  ...KETO_MEALS_LOOKS,
  // founder 2026-11-20, 22:00 ("as many options as you can think about people would choose"): paleo, then Mediterranean-style
  ...PALEO_MEALS_LOOKS,
  ...MEDITERRANEAN_LOOKS,
  // founder 2026-11-20 ("You can't just do [wraps] every single day"; "You want kind of like a varied diet"): lunches that aren't wraps, quick dinners
  ...EVERYDAY_LUNCHES_LOOKS,
  ...QUICK_DINNERS_LOOKS,
  // founder 2026-11-21 ("all the shops, like, they should have recipes"): lunches and dinners nearly every supermarket can make
  ...EVERY_SHOP_LOOKS,
  // founder 2026-11-21 ("different recipes from around the planet"): world plates, bowls and breakfasts
  ...WORLD_MEALS_LOOKS,
  ...HOME_SNACKS_LOOKS,
  ...PROTEIN_MORNINGS_LOOKS,
  ...PROTEIN_MEALS_LOOKS,
  ...ONION_FREE_MEALS_LOOKS,
  ...FAST_MEALS_LOOKS,
};
