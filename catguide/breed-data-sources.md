# Breed Data Sources

Citation trail for the new structured fields (`personality`, `lifestyleBadges`, `groomingDifficulty`, `shedding`, `health`, `relatedBreeds`, `cost`, `timeline`) added to `cat-breed-catalog.html` per `breed-guide-implementation-plan.md`. (A `superlative` field/card ribbon existed briefly for 5 breeds — Largest Breed, Oldest Natural Breed, Fastest Domestic Breed, Longest Lifespan, Rare Breed — but was removed at the user's request as not useful.)

**How to read this file**: health/genetic-risk claims and historical dates are backed by the specific sources listed. Personality star ratings (1-5) have no scientific instrument behind them — they're synthesized from cross-checking that multiple independent descriptive sources agree on a trait, not pulled from a single canonical number. `lifestyleBadges` are only added when directly supported by a source or by the breed's own existing `bestFor`/`detail` text; badges are deliberately omitted rather than guessed when evidence is thin. Cost indicators (`cost`) are approximate by nature, per the roadmap's own framing, and aren't independently sourced facts.

---

## Natural Breeds

### Maine Coon
- Health (HCM — MYBPC3 A31P mutation, ~30% breed prevalence, genetic test + echocardiogram screening): [UC Davis Veterinary Genetics Lab](https://vgl.ucdavis.edu/test/maine-coon-hcm), [NC State Veterinary Hospital](https://hospital.cvm.ncsu.edu/services/small-animals/genetics/maine-coon-cat-hypertrophic-cardiomyopathy-hcm/), [PetMD](https://www.petmd.com/cat/breeds/maine-coon)
- Personality (low independence, social/dog-like attachment; talkative but soft-toned rather than loud): [Hill's Pet](https://www.hillspet.com/cat-care/cat-breeds/maine-coon), [Catster](https://www.catster.com/cat-breeds/maine-coon/)
- Timeline (1895 Cosey/Best in Show; 1973 Maine Coon Cat Club forms after 3 CFA denials; 1976 championship status): [CFA](https://cfa.org/breed/maine-coon-cat/)
- 1985 state-cat naming: already present in the page's existing `detail` text (not independently re-verified this pass)

### Siberian
- Health (PKD — historically introduced via Persian crossbreeding in some lines; HCM screening): [UC Davis VGL — PKD1](https://vgl.ucdavis.edu/test/pkd1-cat), [Catster](https://www.catster.com/cat-health-care/siberian-cat-health-problems/), [Siberian Research](http://siberianresearch.com/breeding-decisions/)
- Personality (affectionate but not clingy, "social yet independent," moderately vocal — chirps/chortles, stays playful for years): [Siberian Cat World](https://www.siberiancatworld.com/siberian-cat-personality/), [BetterPet](https://www.betterpet.com/learn/your-siberian-cat-personality-guide-what-you-need-to-know)

### Norwegian Forest
- Health (HCM, Glycogen Storage Disease Type IV via GBE1 gene, hip dysplasia): [Hepper](https://articles.hepper.com/norwegian-forest-cat-health-problems/), [PetMD](https://www.petmd.com/cat/breeds/norwegian-forest-cat)
- Personality (affectionate but independent, "be in the same room" not velcro cat, quiet/soft vocalizations): [Spot Pet Insurance](https://spotpet.com/blog/cat-tips/what-is-a-norwegian-forest-cats-personality)
- Timeline (1975 Norwegian Cat Association breed standard; 1977 FIFe recognition at Paris General Assembly): [Cat-World](https://cat-world.com/norwegian-forest-cat-profile/)

### Turkish Van
- Health ("generally a healthy breed with few known genetic conditions" — direct basis for Low genetic risk; HCM, sacrocaudal dysgenesis in kittens): [PetMD](https://www.petmd.com/cat/breeds/turkish-van), [CFA](https://cfa.org/breed/turkish-van/)
- Personality (selective/earned affection, highly active, "moderately vocal... quiet distinct voice," the "three V's: very soft, very vocal, very active"): [Hill's Pet](https://www.hillspet.com/cat-care/cat-breeds/turkish-van), [Wopet](https://wopet.com/turkish-van-cat-personality-traits/)

### Turkish Angora
- Health (congenital deafness linked to white coat/blue eyes via KIT gene; hereditary ataxia in kittens; HCM usually in middle-aged males): [PetMD](https://www.petmd.com/cat/breeds/turkish-angora), [cats.com](https://cats.com/cat-breeds/turkish-angora), [Basepaws](https://basepaws.com/cat-breeds/turkish-angora)
- Personality (outgoing/affectionate, doesn't like being left alone, low independence): [Litter-Robot](https://www.litter-robot.com/blog/turkish-angora-personality/)
- Timeline + superlative (15th-century presence in Turkey per CFA; Ankara Zoo conservation program; 1954 first US import; 1972 CFA full recognition of white Angoras, colors in 1978; "among the world's oldest natural breeds"): [CFA Turkish Angora Breed Council history](https://turkishangorabreedcouncil.weebly.com/history.html), [Cattime](https://cattime.com/cat-breeds/turkish-angora-cats)

### Egyptian Mau
- Health (Pyruvate Kinase deficiency mutation found "in significant frequency" in the breed; HCM; bladder stones): [Catster](https://www.catster.com/cat-health-care/egyptian-mau-health-problems/), [UC Davis VGL — PK deficiency](https://vgl.ucdavis.edu/test/pk-deficiency-cat)
- Personality (shy with strangers but deeply bonded/loyal to one person, intelligent, chirping/tail-wiggling when happy): [webMD Pets](https://www.webmd.com/pets/cats/what-to-know-about-an-egyptian-mau), [Cat Authors](https://catauthors.com/news/egyptian-mau-personality-0/)
- Superlative (Fastest Domestic Breed — officially recognized, ~48 km/h / 30 mph): [Guinness World Records](https://www.guinnessworldrecords.com/world-records/411760-fastest-breed-of-domestic-cat)

### American Shorthair
- Health (HCM prevalence across several breeds including American Shorthair; PKD; obesity risk): [Tierarzt Karlsruhe-Durlach](https://tierarzt-karlsruhe-durlach.de/en/diseases-of-the-american-shorthair/), [Hill's Pet](https://www.hillspet.com/cat-care/cat-breeds/american-shorthair)
- Personality (loving/attaches to whole family, easygoing/docile, adaptable with children/dogs, doesn't need constant attention): [Hill's Pet](https://www.hillspet.com/cat-care/cat-breeds/american-shorthair), [cats.com](https://cats.com/cat-breeds/american-shorthair)
- `firstTimeOwner` badge is also directly supported by the existing `bestFor:"Families, first-time owners"` field already on the page.

## Hairless Breeds

### Sphynx
- Health ("one of the highest rates of HCM of any cat breed"; ALMS1 gene marker, incomplete penetrance; urticaria pigmentosa skin condition; hereditary myopathy in some bloodlines — direct basis for High genetic risk): [NC State Veterinary Hospital](https://hospital.cvm.ncsu.edu/services/small-animals/genetics/sphynx-hypertrophic-cardiomyopathy-hcm/), [PMC — HCM/ALMS1 prevalence study](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11428990/), [Furry Critter Network](https://www.furrycritter.com/pages/articles/cats/sphynx_health_problems.htm)
- Personality (extroverted, vocal, "velcro cat," energetic/acrobatic, low independence): [Litter-Robot](https://www.litter-robot.com/blog/sphynx-cat-personality/), [Breedspective](https://www.breedspective.com/sphynx-cat-personality-energy-and-social-traits/)
- Grooming note: despite no coat, regular bathing is required to remove skin-oil buildup — reflected as a real (not zero) grooming-difficulty score.

### Donskoy
- Health (feline ectodermal dysplasia from homozygous hairless-gene pairings — dental/sweat-gland effects; sunburn/oily-skin sensitivity): [Pet Hero](https://pethero.co.za/blog/cat-breeds/donskoy/)
- Personality (playful, affectionate, "little dogs," even-tempered, good with kids/other pets): [cats.com](https://cats.com/cat-breeds/donskoy)

### Peterbald
- Health (Progressive Retinal Atrophy — can cause blindness by age 3; feline ectodermal dysplasia linked to the same dominant hairless gene as Donskoy; skin sensitivity): [Wisdom Panel](https://www.wisdompanel.com/en-us/cat-breeds/peterbald), [The Vet Desk](https://thevetdesk.com/pet-breeds/cats/peterbald-cat/)
- Personality (exceptionally sociable, "velcro nature," excellent with children/other pets): [Pet Insurance HealthZone](https://www.petinsurance.com/healthzone/pet-breeds/cat-breeds/peterbald/)

## Wild Hybrid Breeds

### Bengal
- Health (three defining conditions — HCM, Bengal-specific PRA-b with a clean DNA test via UC Davis VGL/Wisdom Panel, PK deficiency): [Petful](https://www.petful.com/cat-breeds/bengal-cat-health-issues/), [PetMD](https://www.petmd.com/cat/breeds/bengal)
- Personality (extremely active/intelligent, chatty/vocal especially when seeking attention, needs heavy enrichment): [Ask A Vet](https://askavet.com/blogs/news/comprehensive-vet-guide-2025-bengal-cats-wild-looked-smart-and-vet-approved-%F0%9F%90%BE%F0%9F%90%B1)

### Savannah
- Health (PK deficiency DNA-testable; PRA; HCM — explicitly noted that "genetic testing for Savannah cats is not yet available for HCM," which is why the screening note calls out cardiac screening as the only current safeguard): [PetMD](https://www.petmd.com/cat/breeds/savannah), [Purina](https://www.purina.com/cats/cat-breeds/savannah)
- Personality (dog-like loyalty, "velcro cat," leash-trainable, strong hunting instinct around small prey-type pets): [Chewy](https://www.chewy.com/education/cat-breeds/savannah-cat)

### Chausie
- Health (HCM, periodontal disease, short-GI-tract/gluten sensitivity, some Abyssinian-linked disease predisposition, joint strain from large size): [WeRescue](https://www.werescue.pet/breeds/chausie/)
- Personality (intelligent, playful, affectionate, vocal, sociable with other pets when properly socialized young): [Catster](https://www.catster.com/cat-breeds/chausie-cat/)

### Toyger
- Health ("generally healthy with no tightly associated genetic conditions" — direct basis for Low genetic risk; HCM and occasional cow-hocking noted but "not widespread"): [Wisdom Panel](https://www.wisdompanel.com/en-us/cat-breeds/toyger), [Great Pet Care](https://www.greatpetcare.com/cat-breeds/toyger/)
- Personality (affectionate, vocalizes wants, struggles if left alone long, easygoing/family-friendly consistent with having no wild ancestry): [WebMD Pets](https://www.webmd.com/pets/cats/what-to-know-about-toyger)

## Ear & Tail Mutations

### Scottish Fold
- Health ("all folded-eared cats develop osteochondrodysplasia to some extent"; homozygous cats get severe early deformities — direct basis for High genetic risk rather than Moderate): [UFAW](https://www.ufaw.org.uk/cats/scottish-fold-osteochondrodysplasia), [Catster — Osteochondrodysplasia](https://www.catster.com/cat-health-care/osteochondrodysplasia-scottish-fold-cats/)
- Personality ("one of the most even-tempered and affectionate" breeds, patient with children, follows owners around): [Availpet](https://availpet.com/scottish-fold/)

### American Curl
- Health (curl mutation "not associated with any genetic health conditions," explicitly contrasted with the Scottish Fold; prone to ear infections from narrow canals/wax buildup, not a skeletal issue): [WebMD Pets](https://www.webmd.com/pets/cats/what-to-know-about-american-curls), [ASPCA Pet Health Insurance](https://www.aspcapetinsurance.com/resources/american-curls/)
- Personality (affectionate, "Peter Pan of cats," retains kitten-like energy into senior years): [ASPCA Pet Health Insurance](https://www.aspcapetinsurance.com/resources/american-curls/)

### Kurilian Bobtail
- Health ("no known genetic issues," exceptionally long lifespan up to 20 years, health attributed to natural genetic diversity rather than intensive selective breeding — direct basis for Low genetic risk and the Longest Lifespan superlative): [Lux Cat Living](https://luxcatliving.com/cat-breeds/kurilian-bobtail/)
- Personality (intelligent, playful, highly sociable with people and other pets, easily trained): [cats.com](https://cats.com/cat-breeds/kurilian-bobtail)

### Manx
- Health (Manx Syndrome/spina bifida — sacrococcygeal dysgenesis — affects roughly 1 in 5 tailless cats, not only double-copy pairings; two copies of the dominant gene are often embryonic-lethal; congenital deafness in white Manx — direct basis for raising genetic risk to High rather than Moderate): [PetMD — Manx Syndrome](https://www.petmd.com/cat/conditions/genetic/manx-syndrome-cats), [Vet Help Direct](https://vethelpdirect.com/vetblog/2024/08/03/are-manx-cats-genetically-healthy/)
- Personality ("bouncy," dog-like, enjoys pets/children, middle-ground between playful and calm): [Catster](https://www.catster.com/cat-breeds/manx-cat/)

## Long-Haired Classics

### Persian
- Health (PKD "highly prevalent" in the breed; brachycephalic syndrome — breathing difficulty, narrowed nostrils; dental malocclusion; HCM — direct basis for High genetic risk): [cats.com](https://cats.com/cat-breeds/persian), [PetMD](https://www.petmd.com/cat/breeds/persian)
- Personality (placid, gentle, apartment-suited; doll-face lines have fewer brachycephalic complications than extreme peke-faced show lines): [Pets Best](https://www.petsbest.com/blog/cat-breed-guide-persian)

### Himalayan
- Health (PKD1 — same autosomal dominant mutation as Persian, needs only one copy; brachycephalic dental/eye issues; feline hyperesthesia syndrome): [PetMD](https://www.petmd.com/cat/breeds/himalayan), [Rover](https://www.rover.com/blog/himalayan-cat/)
- Personality (affectionate with people, other cats, and dogs; "rarely vocalise their dissatisfaction," playful but calmer than expected): [Untamed](https://untamed.com/blogs/cat-breeds/himalayan-persian-cat)

### Ragdoll
- Health (~30% of Ragdolls carry the HCM mutation; homozygous cats can be fatal by ~3 years, heterozygous cats milder/later; PKD also documented): [Pastel Ragdolls — HCM guide](https://www.pastelragdolls.com/blog/hcm-in-ragdoll-cats-what-every-owner-should-know-about-hypertrophic-cardiomyopathy), [Dr. Judy Morgan](https://drjudymorgan.com/blogs/blog/common-genetic-diseases-of-ragdoll-cats)
- Personality (gentle/affectionate, patient with children, rarely vocal unless hungry, "dog-like" devotion): [WebMD Pets](https://www.webmd.com/pets/cats/what-to-know-about-a-ragdoll-cat), [PetPlace](https://www.petplace.com/article/cats/pet-behavior-training/cat-behavior-training/ragdoll-cat-personality-traits)

### Birman
- Health (HCM, PKD — both DNA-testable; hypomyelination — a Birman-specific, potentially fatal condition causing tremors/seizures in kittens as young as 3 weeks): [PetMD](https://www.petmd.com/cat/breeds/birman), [ASPCA Pet Health Insurance](https://www.aspcapetinsurance.com/resources/birman/)
- Personality (loving/outgoing/sweet, "velcro cat," playful climber, good for new and experienced owners alike): [BowWow Insurance](https://bowwowinsurance.com.au/cats/cat-breeds/birman/)

### Somali
- Health ("generally healthy" overall; PRA causes irreversible blindness within months with no treatment; PK deficiency; renal amyloidosis; HCM given shared Abyssinian ancestry): [Catsmeowweb](https://www.catsmeowweb.com/archives/23591), [PetMD](https://www.petmd.com/cat/breeds/somali)
- Personality (playful, energetic, dog-like loyalty, highly curious, learns to open cabinets/solve puzzles, needs 60-90+ min/day activity): [Wopet](https://wopet.com/cats/somali-cat/)
- `relatedBreeds` set to Abyssinian rather than a coat/temperament lookalike — the page's own existing `detail` text already states the Somali *is* "essentially a long-haired Abyssinian."

## Short-Haired Classics

### British Shorthair
- Health (elevated PKD risk from historical Persian crossbreeding — PKD-clear certificates recommended; HCM; obesity tendency): [British Shorthair Cat](https://www.britishshorthaircat.co.uk/british-shorthair-health/), [VetLens](https://www.vetlens.com/breeds/cats/british-shorthair)
- Personality (friendly/affectionate yet independent, not clingy, slow to mature — full personality emerges 3-5 years): [Petz.uk](https://www.petz.uk/british-shorthair-guide/)

### Russian Blue
- Health (explicitly "a robust breed with no known genetic health issues" — direct basis for Low genetic risk; obesity, bladder stones, and age-related hyperthyroidism are general-cat risks rather than breed-linked): [HolistaPet](https://www.holistapet.com/blogs/cat-breeds/russian-blue-feline)
- Personality (shy/reserved with strangers but deeply bonded and quiet with family, low vocalness): [WebMD Pets](https://www.webmd.com/pets/cats/what-to-know-about-russian-blue-cat), [ASPCA Pet Health Insurance](https://www.aspcapetinsurance.com/resources/russian-blue-cat-facts/)

### Abyssinian
- Health (PK deficiency at "significantly higher frequency" than the general cat population, autosomal recessive; PRA/photoreceptor dysplasia causing blindness within months in affected kittens): [UFAW](https://www.ufaw.org.uk/cats/abyssinian---pyruvate-kinase-deficiency-), [EveryCat Health Foundation](https://everycat.org/cat-health/pyruvate-kinase-deficiency-in-abyssinian-somali-cats/)
- Personality (people-oriented, boisterous/energetic, kittenish for life, not typically a lap cat): [Great Pet Care](https://www.greatpetcare.com/cat-breeds/abyssinian-cat/)

### Burmese
- Health (diabetes at up to 10% breed prevalence, ~4x average risk; Burmese hypokalemia — DNA-testable, treatable; craniofacial abnormalities; rare endocardial fibroelastosis; low genetic diversity from historical inbreeding — direct basis for High genetic risk): [Burmese Whiskers](https://burmesewhiskers.com/7-burmese-cat-health-issues/), [UC Davis VGL — hypokalemia](https://vgl.ucdavis.edu/test/burmese-hypokalemia)
- Personality ("Velcro cat," dog-like, craves physical presence, calm/kind temperament, softer voice than Siamese): [Litter-Robot](https://www.litter-robot.com/blog/burmese-cat-personality/)

### Siamese
- Health (PRA, glaucoma; amyloidosis specifically noted as affecting Siamese/Oriental/Burmese, no cure): [VetLens](https://www.vetlens.com/breeds/cats/siamese), [Catster](https://www.catster.com/cat-health-care/siamese-cat-health-problems/)
- Personality (craves constant interaction, famously vocal/opinionated, dislikes being left alone): [CuteCatsHQ](https://cutecatshq.com/blog/siamese-cat-breed-guide)

### Oriental Shorthair
- Health (retinal degeneration; HCM plus a notably wide additional list of inherited heart conditions — dilated cardiomyopathy, endocardial fibroelastosis, aortic stenosis; anesthesia sensitivity from lean build): [Catster](https://www.catster.com/cat-health-care/oriental-shorthair-cat-health-problems/), [Bioguardlabs](https://www.bioguardlabs.com/breed-related-disease-oriental-shorthair/)
- Personality (affectionate, dog-like, extremely vocal with a signature "honk," becomes withdrawn if isolated too long): [Litter-Robot](https://www.litter-robot.com/blog/oriental-shorthair/)

### Cornish Rex
- Health ("excellent overall health, no unique genetic conditions" but explicitly elevated patellar-luxation risk; hypotrichosis; some heritable deafness in bloodlines): [Spot Pet Insurance](https://spotpet.com/breeds/cat-breeds/cornish-rex), [Bioguardlabs](https://www.bioguardlabs.com/breed-related-disease-cornish-rex/)
- Personality (curious, bright, "high-energy... emphasis on the high-energy"): [Spot Pet Insurance](https://spotpet.com/breeds/cat-breeds/cornish-rex)

### Devon Rex
- Health (hereditary myopathy — DNA-testable, Devon-Rex-specific, onset 3-23 weeks; hip dysplasia and patellar luxation both explicitly called out as more common than in other breeds; HCM; PKD also identified — direct basis for High genetic risk): [UFAW — hereditary myopathy](https://www.ufaw.org.uk/cats/devon-rex---hereditary-myopathy), [Catster](https://www.catster.com/cat-health-care/devon-rex-cat-health-problems/)
- Personality ("velcro-cat territory" affection, kitten-like energy for years, climbs everything, many fetch, gentle with children): [Petful](https://www.petful.com/cat-breeds/devon-rex-personality/), [Modern Cat](https://moderncat.com/articles/breeds/the-devon-rex-cat-breed-profile-personality-care/)

## Rare & Distinctive

### Munchkin
- Health (lordosis — spinal curvature that can cause hind-leg weakness; pectus excavatum — chest deformity affecting breathing; the short-leg gene is dominant-but-lethal in homozygous form, a 25% non-viable-embryo risk from two short-legged parents): [Pets4Homes](https://www.pets4homes.co.uk/pet-advice/munchkin-cat-health-and-genetics.html), [Catster](https://www.catster.com/cat-health-care/munchkin-cat-health-problems/)
- Personality (spunky, confident, sociable, loves attention and lap time): [Litter-Robot](https://www.litter-robot.com/blog/munchkin-cat-personality/)
- **Correction worth flagging**: the page's own existing `detail` text (sourced from TICA's own breed page) frames the Munchkin as "not prone to arthritis and free of the debilitating genes... associated with dwarfism" — independent veterinary sources document real lordosis/pectus excavatum risk, so `geneticRisk` is set to Moderate rather than defaulting to Low on the strength of the breed registry's own (naturally more favorable) framing alone.

### LaPerm
- Health (explicitly "no breed-specific health problems currently known... no known genetic diseases," credited to a large genetic pool — direct basis for Low genetic risk): [HolistaPet](https://www.holistapet.com/blogs/cat-breeds/laperm-cat)
- Personality (affectionate, sociable, playful, mischievous/goofy, craves companionship): [WebMD Pets](https://www.webmd.com/pets/cats/what-to-know-la-perm)

### Khao Manee
- Health (congenital deafness linked to white coat/blue eyes, but explicitly documented as "much rarer in the Khao Manee than in other blue-eyed white cats such as the Foreign White"; HCM as a general breed-agnostic risk): [Feline Fancy](https://felinefancy.co.uk/blogs/cat-breeds-info/khao-manee), [ASPCA Pet Health Insurance](https://www.aspcapetinsurance.com/resources/khao-manee-cat-facts/)
- Personality (curious, intelligent, affectionate, talkative with a pleasant voice, dislikes being left alone): [Happy Pet Care](https://www.happypet.care/cat-breeds/khao-manee)

### Lykoi
- Health (a 2020 genetics study found no health concerns beyond lymphocytic mural folliculitis, the coat-related follicle condition; separately, achondroplastic dwarfism developed during selective breeding, which can cause arthritis and limb deformities — a finding not mentioned in the page's existing `detail` text, surfaced only through direct research): [Catster](https://www.catster.com/ask-the-vet/lykoi-wolf-cat-health-problems/), [Petful](https://www.petful.com/cat-breeds/lykoi-cat-health/)
- Personality ("wild-at-heart," not typically a lap cat, highly playful and dog-like in behavior — set independence noticeably higher than most other breeds in this file to reflect that distinguishing trait accurately): [The Cattitude Central](https://thecattitudecentral.com/lykoi-cat/)
- Superlative (Rare Breed — confirmed independently, matching the existing `detail` text's own claim): [PetMD](https://www.petmd.com/cat/breeds/lykoi)

---

## Cross-Check Pass: Purina UK Breed Directory

At the user's request, all breeds with a page on [purina.co.uk/find-a-pet/cat-breeds](https://www.purina.co.uk/find-a-pet/cat-breeds/) were cross-checked against that source's "Vet Rating Scale" (a 1-5 scale for Family-friendly, Playfulness, Intelligence, Tendency to Vocalise, Likes Other Pets, Grooming needs, Shedding) and its health/family-compatibility text.

**Note on directory coverage**: the directory's pagination isn't exposed via normal page numbers — the working pattern turned out to be `?page=%2C1` through `?page=%2C4` (5 pages, 52 breeds total), and several breed slugs don't match their display name (LaPerm is `la-perms`, Siberian is listed as `siberian-forest`, Oriental Shorthair as `oriental-short-hair`). An initial pass guessing conventional slugs missed these three; checking the full directory listing found them. 27 of our 35 breeds have a Purina page after accounting for this; the other 8 (Turkish Angora, American Shorthair, Donskoy, Peterbald, Chausie, American Curl, Kurilian Bobtail, Himalayan) are confirmed absent from all 5 directory pages and were left unchanged.

**Methodology for corrections**: a 1-point rating difference from our existing value was treated as normal cross-source variance and left alone. A 2+ point difference was corrected to the average of the two sources, rounded, rather than fully adopting either one. A `lifestyleBadges` conflict (Purina's Family-friendly rating ≤2/5 or explicit "not ideal for family homes" text contradicting an existing `familyFriendly`/`goodWithChildren` badge) was treated as a real correction — the badge was removed and `experiencedOwners` added where Purina's text supported it. Health conditions Purina documented that we didn't have were added to `health.concerns`.

- **Maine Coon** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/maine-coon)): vocalness 3→4; added Pyruvate Kinase Deficiency, Spinal Muscular Atrophy to health concerns.
- **Sphynx** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/sphynx)): vocalness 4→5. Everything else matched well, including our conservative `experiencedOwners`-only badge choice (Purina: "not brilliant with young children").
- **Bengal** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/bengal)): vocalness 4→3 (real disagreement — we had it as notably vocal, Purina rates it 2/5; averaged rather than fully adopting either). Added Patellar Luxation, Hip Dysplasia, Peripheral Neuropathy to health concerns (skipped FIP as non-hereditary). Family-friendly 1/5 confirmed our existing conservative badge choice (no `familyFriendly`).
- **Scottish Fold** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/scottish-fold)): added Brachycephalic Airway Obstruction Syndrome, facial-fold skin/eye issues, and Polycystic Kidney Disease to health concerns — a genuine new finding (Scottish Folds can have brachycephalic-type conformation issues similar to Persians, which wasn't in our original research).
- **Persian** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/persian)): vocalness 1→2 (averaged). Added Alpha-Mannosidosis to health concerns.
- **Siamese** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/siamese)): added Feline Asthma, Mucopolysaccharidosis, Niemann-Pick Disease, GM2 Gangliosidosis, Intestinal Adenocarcinoma, and Mediastinal Lymphoma to health concerns — Purina's health list here was substantially more complete than our original 3-item list; the storage diseases and asthma predisposition are independently documented in veterinary genetics literature for this breed.
- **Ragdoll** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/ragdoll)): vocalness 1→3 — the largest single correction in this pass (Purina rates vocalness 4/5 against our original 1/5; averaged rather than fully adopting Purina's number given our original source's explicit "rarely vocal unless hungry" quote).
- **Devon Rex** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/devon-rex)): **removed** `familyFriendly`/`goodWithChildren`, **added** `experiencedOwners` — Purina rates Family-friendly 2/5 and explicitly says "not ideal for family homes," directly contradicting our original badges (same pattern as the Munchkin case that prompted this whole cross-check). Added Hypotrichosis, Polycystic Kidney Disease to health concerns.
- **Munchkin** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/munchkin)): **removed** `familyFriendly`/`goodWithChildren`, **added** `experiencedOwners` (Family-friendly 2/5, "unsuitability for typical family homes with young children" — the original conflict that triggered this cross-check pass). Grooming 2→3.
- **Birman** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/birman)): added `goodWithDogs` badge (Likes Other Pets 5/5, strongly confirmed).
- **Somali** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/somali)): vocalness 3→4.
- **Turkish Van** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/turkish-van)): **removed** `goodWithChildren`, **added** `firstTimeOwner` — Purina explicitly says "great for first-time cat owners" but "not ideal for family homes" due to mischievous behavior (stealing/knocking over objects) unsuitable for very young children — an unusual combination worth preserving accurately. Grooming 2→3. Note: Purina says "no common disorders reported... generally healthy" for this breed, which is milder than our existing HCM/sacrocaudal dysgenesis entries from more specific veterinary sources — we kept our more detailed entries rather than removing them, since Purina's overview may simply be less detailed for this rarer breed.
- **Egyptian Mau** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/egyptian-mau)): no changes needed — everything matched within normal variance, and our existing conservative badges were confirmed ("too sensitive for busy households with very young children").
- **Norwegian Forest** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/norwegian-forest)): **removed** `familyFriendly` (kept `goodWithDogs`) — Family-friendly rated only 2/5. Vocalness 2→3. Added Pyruvate Kinase Deficiency to health concerns.
- **Savannah** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/savannah)): grooming 1→3 (real disagreement, averaged). Our existing conservative badges (no `familyFriendly`, no `firstTimeOwner`) were strongly confirmed: "not recommended for the family home, nor... as a first-time cat."
- **Toyger** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/toyger)): no changes needed — "designed to be a family friendly cat" confirms our existing `familyFriendly`/`goodWithChildren` badges.
- **Manx** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/manx)): **removed** `goodWithDogs` (Likes Other Pets only 2/5, a real signal against it) — kept `familyFriendly`/`goodWithChildren` since Purina's text ("will suit most family homes") stayed positive despite a middling 2.3/5 number. Added early-onset arthritis and bowel blockages (narrowed anal passages) to health concerns.
- **British Shorthair** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/british-shorthair)): vocalness 2→3, grooming 2→3. Added British Shorthair Autoimmune Lymphoproliferative Syndrome to health concerns (a serious breed-specific condition not in our original research) and raised `geneticRisk` to High accordingly.
- **Russian Blue** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/russian-blue)): shedding 1→2 — a conservative partial adjustment rather than fully adopting Purina's 4/5, since our original source's explicit "low shedding" claim is a well-established, frequently-cited trait of this breed; flagging this as a real but only partially resolved disagreement. "No widely recognised health problems" independently confirmed our existing `geneticRisk: "Low"`.
- **Abyssinian** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/abyssinian)): grooming 1→2. Added Amyloidosis to health concerns.
- **Burmese** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/burmese)): added `goodWithChildren` badge (Family-friendly 5/5, strongly confirmed). Added Orofacial Pain Syndrome, Pectus Excavatum, and Gangliosidosis to health concerns.
- **Cornish Rex** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/cornish-rex)): added Polycystic Kidney Disease and Progressive Retinal Atrophy to health concerns.
- **Khao Manee** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/khao-manee)): **removed** `familyFriendly` (Family-friendly 2/5, "not typically child-friendly... not ideal for family homes") — a real conflict with our original badge.
- **Lykoi** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/lykoi)): vocalness 3→4. Shedding 1→2 (conservative partial adjustment — Purina rates 4/5, but our existing page text explicitly markets this breed's "striking, low-shedding look," so we didn't fully adopt Purina's number). Purina says "no common disorders reported," milder than our existing 2020-genetics-study-sourced entry — kept our more specific entry since it traces to an actual study.

**Found in a follow-up pass** (initially missed due to unexpected URL slugs — see coverage note above):

- **Siberian** ([Purina, listed as "Siberian Forest"](https://www.purina.co.uk/find-a-pet/cat-breeds/siberian-forest)): grooming 3→4. Added Pyruvate Kinase Deficiency to health concerns — distinct from the Polycystic Kidney Disease we already had listed; easy to conflate the two but they're genuinely different conditions.
- **Oriental Shorthair** ([Purina, listed as "Oriental Short Hair"](https://www.purina.co.uk/find-a-pet/cat-breeds/oriental-short-hair)): shedding 2→3 — a conservative partial adjustment rather than fully adopting Purina's 5/5, since that number is inconsistent with Purina's own 2/5 shedding rating for the near-identical Siamese, suggesting a possible data quirk on their end. Added Hepatic Amyloidosis and Flat-Chested Kitten Syndrome to health concerns.
- **LaPerm** ([Purina, listed under the slug "la-perms"](https://www.purina.co.uk/find-a-pet/cat-breeds/la-perms)): vocalness 3→4, grooming 2→3. Added `firstTimeOwner` badge (Purina: "great for first-time cat owners," Family-friendly 4/5). Replaced the generic "no breed-specific conditions" framing with a real, breed-associated Pyruvate Kinase Deficiency entry (DNA-testable) — this breed does have a documented specific risk, it just isn't severe or common enough to change the overall Low genetic-risk rating.

### Second follow-up: Purina New Zealand (for breeds purina.co.uk doesn't cover)

`purina.com` (the US site) blocks automated fetching entirely — 403 Forbidden on every page tried, including ones confirmed to exist on the UK site — so it couldn't be used. `purina.co.nz` turned out to cover several of the remaining gaps, though its pages use plain descriptive text rather than the UK site's numeric 1-5 Vet Rating Scale, so corrections here are directional rather than point-averaged.

- **Turkish Angora** ([Purina NZ](https://www.purina.co.nz/cats/cat-breeds/turkish-angora)): added `familyFriendly` and `goodWithDogs` badges ("Great family cat," "good for family multi-pet households") — a second independent source now supports broader lifestyle suitability beyond our original conservative `experiencedOwners`-only badge.
- **American Shorthair** ([Purina NZ](https://www.purina.co.nz/cats/cat-breeds/american-shorthair)): no changes — fully validated. "Ideal companion for families with children," "works well with cat-friendly dogs," "suitable as indoor pet," and "quiet" all independently confirm our existing badges and low vocalness rating.
- **American Curl** ([Purina NZ](https://www.purina.co.nz/cats/cat-breeds/american-curl)): vocalness 3→2 ("quiet vocalizer"), shedding 2→1 ("minimal shedding"). Added `goodWithDogs` badge ("good for multi-pet households, easily adjusts to other pets and children").
- **Himalayan** ([Purina NZ](https://www.purina.co.nz/cats/cat-breeds/himalayan)): activity 2→3 and vocalness 1→2 (both partial corrections — Purina NZ describes it as "highly active" and "moderate" vocalization, notably more than our original Persian-lineage-influenced "calm, rarely vocal" framing, but we didn't fully adopt either since our original source's specific quotes are still credible). Added `goodWithChildren` badge ("good with children and other pets").
- **Donskoy, Peterbald, Chausie, Kurilian Bobtail**: confirmed 404 on Purina NZ too (in addition to UK and the blocked US site) — genuinely not covered by any Purina region checked.

### Third follow-up: Litter-Robot blog (for the last gaps; `thesprucepets.com` is blocked at the tool level and couldn't be tried)

- **Donskoy** ([Litter-Robot](https://www.litter-robot.com/blog/donskoy-cat/)): grooming 3→4 ("bathed regularly," daily wipe-downs, ear/nail/teeth care — a real, more demanding routine than we'd credited), shedding 1→2 ("Low to Medium," not just "Low"). Added `experiencedOwners` badge alongside the existing family-oriented ones ("not meant for your average first-time pet parent," despite otherwise being an "excellent family pet" — the two aren't contradictory, similar to Burmese's existing badge combination).
- **Peterbald** ([Litter-Robot](https://www.litter-robot.com/blog/peterbald-cat/)): added `familyFriendly` badge ("fabulous family pets" — a gap in our original badges, not a conflict). Added Squamous Cell Carcinoma and Periodontal Disease to health concerns.
- **Chausie** ([Litter-Robot](https://www.litter-robot.com/blog/chausie-cat/)): added `familyFriendly` and `goodWithChildren` badges ("can do well in a family with children or other animals... with proper introductions" — a gap, not a conflict, in our original conservative badge set).
- **Kurilian Bobtail**: confirmed 404 on Litter-Robot — not covered by Purina UK, Purina NZ, or Litter-Robot. Found on a fourth source below.

### Fourth follow-up: Vetstreet (closes the last gap)

[Vetstreet's cat breed directory](https://www.vetstreet.com/category/cats/cat-breeds) doesn't list Kurilian Bobtail on its visible pages either, but the direct breed URL (`vetstreet.com/cats/kurilian-bobtail`) exists and has real content. Vetstreet displays numeric bar-chart ratings for the same kind of traits (Adaptability, Affection, Child/Dog Friendly, Energy, Grooming, Shedding, etc.), but the actual values are rendered as image/CSS bars rather than plain text or accessible markup, so they couldn't be extracted — only the descriptive text was usable here.

- **Kurilian Bobtail** ([Vetstreet](https://www.vetstreet.com/cats/kurilian-bobtail)): independence 2→3 ("intelligent and independent yet sociable" reads as more balanced than our original "low independence" framing). Shedding 3→2 ("sheds minimally," a fairly specific claim). Added Obesity to health concerns ("obesity prevention is emphasized as crucial for overall wellness") while keeping `geneticRisk: "Low"` — Vetstreet's own framing ("generally healthy... no known genetic health problems") independently confirms our existing rating, and obesity here is a manageable lifestyle factor rather than a genetic risk.

## Fifth Pass: Pre-Existing Fields, Remaining Lifestyle Badges, and Further Reading Links

At the user's request, this pass went back over the fields that predate the whole Breed Index roadmap (`origin`, `weight`, `lifespan`, `coat`, `energy`, `detail`) — none of which had been cross-checked against an outside source before — plus the four lifestyle badges the earlier badge sweep hadn't specifically targeted (`apartmentFriendly`, `indoorPreferred`, `firstTimeOwner`, `experiencedOwners`). It reused the same cross-check source already identified for each breed in the passes above (Purina UK, Purina NZ, Litter-Robot, or Vetstreet). Each breed's single `link` field was also converted to a `links` array so the modal's "Further Reading" section can show the TICA profile alongside this second source.

**Methodology for `weight`/`lifespan` ranges**: where the new source's range fell entirely inside our existing range, it was left unchanged (our range already covers it). Where the new source extended past one or both of our bounds, the range was widened to the union of both — treating breed weight/lifespan as genuine biological variation best captured broadly, rather than picking one source over the other. Energy level (our six-step vocabulary: Low → Very High) was nudged one step when a source's language clearly implied a different tier; left alone for softer/ambiguous language. `apartmentFriendly`/`indoorPreferred`/`firstTimeOwner`/`experiencedOwners` were added only on a direct, explicit quote, and removed only where a new source directly contradicted an existing badge (mirroring the `familyFriendly` corrections from the second pass).

### Natural Breeds
- **Maine Coon** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/maine-coon)): lifespan floor 12→9 yrs ("9 - 15 years"). Energy Medium→Medium-High ("Highly active and inquisitive cat"). Added `firstTimeOwner` badge ("Great for first-time cat owners").
- **Siberian** ([Purina, "Siberian Forest"](https://www.purina.co.uk/find-a-pet/cat-breeds/siberian-forest)): weight floor 3.6→3.5kg (minor union widen). Added `firstTimeOwner` badge. **Follow-up correction**: also added `goodWithChildren` and `goodWithDogs` — a gap from the original second-pass Purina cross-check (which only recorded a grooming/health update for this breed under its "Siberian Forest" slug and missed the "Likes Other Pets" rating of 4/5 and the direct quote "gets along really well with everybody, kids and other pets included").
- **Norwegian Forest** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/norwegian-forest)): weight ceiling 9→10kg, lifespan floor 14→12 yrs (source: "5.8 - 10kg", "12 - 15 years"). Energy Medium→Medium-High. Added `firstTimeOwner` badge — Purina's "Not ideal for family homes" independently re-confirms the earlier removal of `familyFriendly` for this breed.
- **Turkish Van** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/turkish-van)): no field changes — weight/lifespan/coat/energy all confirmed or already a superset of Purina's range; `firstTimeOwner` badge re-confirmed.
- **Turkish Angora** ([Purina NZ](https://www.purina.co.nz/cats/cat-breeds/turkish-angora)): no field changes — Purina NZ's "semi-long, full" coat description is a single-source terminology variant against our "long, fine" framing, not corroborated elsewhere, so left as-is. No lifespan data given by this source.
- **Egyptian Mau** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/egyptian-mau)): weight ceiling 5→6kg. Added `indoorPreferred` badge ("far too... to be given free, unsecured access to the great-outdoors," recommending a secure garden/catio setup instead).
- **American Shorthair** ([Purina NZ](https://www.purina.co.nz/cats/cat-breeds/american-shorthair)): no numeric field changes. Added `indoorPreferred` badge (explicit "Indoor cat" line).

### Hairless Breeds
- **Sphynx** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/sphynx)): weight floor 2.7→2.5kg. Added `apartmentFriendly` and `indoorPreferred` badges ("Suitable for apartments given their indoor-only requirement"; "Must be strictly indoor cats").
- **Donskoy** ([Litter-Robot](https://www.litter-robot.com/blog/donskoy-cat/)): weight widened to 2.7–6.8kg ("6-15 lbs"). Energy High→Medium-High (source explicitly rates "Energy Level: Medium," averaged against our original High rather than fully adopted). Coat field corrected from "one of 4 partial-coat types" to "one of 3 partial-coat types" (the source's own taxonomy — and our own detail prose — lists 4 coat outcomes total: 1 bald + 3 partial, not 4 partial on top of bald). Detail-prose correction: the kitten Varvara was found/rescued by Professor Elena Kovaleva, not by breeder Irina Nemikina — Nemikina's documented role was determining that the hairless gene is dominant, not discovering the cat.
- **Peterbald** ([Litter-Robot](https://www.litter-robot.com/blog/peterbald-cat/)): weight ceiling 5→6.4kg, lifespan floor 12→10 yrs. Coat field corrected — the source's taxonomy has 5 named coat types, and the fullest-coated is a separate "straight coat" type, not "brush coat" (brush is a middle wiry/wavy category) — reworded to avoid mischaracterizing "brush" as the full-coat end. Added `apartmentFriendly` and `indoorPreferred` badges.

### Wild Hybrid Breeds
- **Bengal** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/bengal)): weight widened to 2.7–7.7kg, lifespan widened to 10–20 yrs. Added `indoorPreferred` badge ("Not recommended as a free outdoor cat," secure run recommended instead). Origin: Purina's "developed in the 1990s" was **not** adopted — Jean Mill's 1963 first cross and early-1980s breeding program is a well-documented, independently corroborated history elsewhere; Purina's brief mention likely simplifies toward the breed's wider TICA recognition era rather than contradicting the origin story. Flagged, not changed.
- **Savannah** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/savannah)): weight floor widened 5.9→3.5kg (F1 framing kept). Lifespan widened to 12–20 yrs — Purina's own range ("17-20 years") sits entirely above our original 12–15+, a genuine surprise given the breed's demanding care profile, but taken at face value with no counter-evidence. Added `indoorPreferred` badge.
- **Chausie** ([Litter-Robot](https://www.litter-robot.com/blog/chausie-cat/)): weight ceiling widened 7→11kg ("up to 25 pounds"), lifespan floor widened 12→10 yrs.
- **Toyger** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/toyger)): lifespan corrected from "13+ yrs" to "9–13 yrs" — Purina's explicit range directly conflicts with our open-ended "13+" framing and we have no counter-source. Added `experiencedOwners` badge — a real gap versus the other three hybrid breeds, all of which already had it ("Benefits from an experienced owner").

### Ear & Tail Mutations
- **Scottish Fold** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/scottish-fold)): weight widened to 2.5–6kg. Added `firstTimeOwner` badge.
- **American Curl** ([Purina NZ](https://www.purina.co.nz/cats/cat-breeds/american-curl)): weight floor widened 3→2kg. Added `indoorPreferred` badge ("Indoor cat"). This source had no history or lifespan section at all, so the 1981/Shulamith origin story and "10–20 yrs" lifespan remain unverified by this particular source (not contradicted, just unaddressed).
- **Kurilian Bobtail** ([Vetstreet](https://www.vetstreet.com/cats/kurilian-bobtail)): energy Medium-High→High ("This is a highly active cat... outgoing and active"). Weight/lifespan left unchanged — the small weight-range gap is plausibly lb→kg rounding noise, and Vetstreet gives no lifespan figure at all.
- **Manx** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/manx)): lifespan corrected from "16+ yrs" to "8–15 yrs" — a large, one-sided conflict with no counter-source supporting a claim above 15. `bestFor` updated to flag the source's explicit "Needs extensive outdoor space" (not previously reflected anywhere in this breed's data). Added `firstTimeOwner` badge.

### Long-Haired Classics
- **Persian** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/persian)): lifespan widened to 8–12 yrs. Added `experiencedOwners` badge ("Benefits from an experienced owner") alongside the existing `apartmentFriendly`/`indoorPreferred`.
- **Himalayan** ([Purina NZ](https://www.purina.co.nz/cats/cat-breeds/himalayan)): weight ceiling widened 5.5→6.5kg. Energy Low-Medium→Medium ("Highly active and inquisitive cat... playful, active, social"). **Detail-prose correction**: Purina NZ credits the breed's founding to "an American cat breeder, Marguerita Goforth" beginning in 1950 — conflicting with our original "Virginia Cobb and Dr. Clyde Keeler... in 1931" claim. Reconciled rather than replaced: the detail text now credits Cobb & Keeler's 1930s genetic proof-of-concept crosses (the well-documented "Newton's Debutante" kitten) followed by Goforth's 1950 program that developed it into a stable breeding line — both claims appear to describe different, real stages of the same history rather than one being simply wrong. Origin field updated to "genetic proof-of-concept 1930s, breed program from 1950."
- **Ragdoll** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/ragdoll)): no numeric field changes (weight/lifespan/coat/energy all confirmed near-exactly). Added `indoorPreferred` badge ("Not suited to free access to the outdoors... too laid back to avoid danger").
- **Birman** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/birman)): weight corrected from a flat "~5.4kg (both sexes)" to a proper range "2.7–5.4kg" (Purina's own range implies real sex-based variation the flat figure didn't capture). Lifespan widened to 9–16 yrs. Energy Medium→Medium-High. Added `indoorPreferred` badge ("a little too laid back to really cope outdoors," high theft risk noted).
- **Somali** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/somali)): lifespan corrected from "10–19+ yrs" to "10–16 yrs" — our original "19+" claim traced to a less authoritative source (Wopet) and lacks corroboration; Purina's more specific, lower range was adopted. `apartmentFriendly`/`indoorPreferred` explicitly and strongly contradicted by Purina ("Outdoor space is essential," "Not suitable as indoor-only") — good independent confirmation that neither badge belongs on this breed. Origin: Purina's claim that the breed was "developed and refined in Britain" was **not** adopted — the US/Canada 1970s recognition narrative (Somali Cat Club of America, 1972) is the more commonly cited history elsewhere and Purina's single-line mention may be conflating this breed's history with the Abyssinian's own British development. Flagged, not changed.

### Short-Haired Classics
- **British Shorthair** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/british-shorthair)): weight widened to 3–7.7kg. Added `apartmentFriendly` badge.
- **Russian Blue** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/russian-blue)): weight ceiling widened 5.5→7kg. `shedding` raised 2→3 and the detail-prose's "combined with low shedding" claim removed — this is now the **second** independent source (after the original Purina UK cross-check pass) to rate this breed's shedding well above "low," so the claim no longer has a defensible basis. **Badge correction**: `indoorPreferred` and `experiencedOwners` removed, `firstTimeOwner` added — Purina directly contradicts both former badges ("a bit of both indoor and outdoor space"; "Great for first-time cat owners"), the same kind of explicit conflict that drove the Devon Rex/Munchkin corrections in the second pass.
- **Abyssinian** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/abyssinian)): lifespan corrected from "14–17+ yrs" to "9–17 yrs" (Purina: "9 - 15 years," widened rather than adopted outright given the size of the original claim). Added `indoorPreferred` badge ("often better as mostly indoor cats with access to secure cat runs").
- **Burmese** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/burmese)): energy Medium-High→High. **Badge correction**: `experiencedOwners` removed, `firstTimeOwner` added — Purina explicitly states "Great for first-time cat owners" and "Not suited to a completely indoor life," directly contradicting the former badge.
- **Siamese** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/siamese)): weight widened to 2.5–6.5kg (Purina's "5-6.5kg" sits almost entirely above our original range). Lifespan widened to 8–20 yrs.
- **Oriental Shorthair** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/oriental-short-hair)): lifespan corrected from "10+ yrs (often 20+)" to "10–15 yrs" — the "often 20+" claim isn't corroborated anywhere and Purina directly gives a lower, specific range.
- **Cornish Rex** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/cornish-rex)): lifespan widened to 9–15 yrs.
- **Devon Rex** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/devon-rex)): weight ceiling widened 4→4.5kg. Lifespan corrected from "14–17+ yrs" to "9–17 yrs" (Purina: "9 - 15 years," widened rather than adopted outright). Added `indoorPreferred` badge.

### Rare & Distinctive
- **Munchkin** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/munchkin)): lifespan corrected from "15–18+ yrs" to "12–18 yrs." Added `indoorPreferred` badge ("Strictly an indoor cat... not equipped for life outdoors"). Purina's explicit "prone to arthritis and back injuries due to short legs" is a direct counterpoint to TICA's own more favorable framing already quoted in our detail text — no change made there, since the existing `health.concerns` (Lordosis, Pectus Excavatum) and `geneticRisk: "Moderate"` already reflect the more cautious veterinary view over the registry's own framing (see the original Phase 2 note above).
- **LaPerm** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/la-perms)): weight widened to 2.2–4.5kg, lifespan floor widened 12→10 yrs. Energy Medium→Medium-High ("Highly active and inquisitive cat," tempered against the source's own "very easy to live with... content to sit on laps" framing).
- **Khao Manee** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/khao-manee)): energy Medium-High→High. Origin/lifespan/coat all confirmed almost exactly, no changes.
- **Lykoi** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/lykoi)): origin year corrected from "2011" to "2010–2011" to match the source ("originated... in 2010") and our own already-hedged detail prose. Weight floor widened 2.7→2kg. Added `indoorPreferred` badge ("should be kept as indoor cats").

## Sixth Pass: familyFriendly / goodWithChildren / goodWithDogs Consistency Sweep

Prompted by a spot-check on Siberian (which turned out to be missing `goodWithChildren`/`goodWithDogs` despite its source explicitly rating it 4/5 "Likes Other Pets" and saying it "gets along really well with everybody, kids and other pets included"). That gap traced to the rushed third "follow-up" re-check earlier in this file (Siberian, Oriental Shorthair, LaPerm — the three breeds initially missed due to unexpected URL slugs), which only recorded grooming/health updates and skipped the family/pets rating each source actually gives.

Rather than patch just those three, all 35 breeds were re-checked against their already-identified source specifically for its "Likes Other Pets" rating/text and "Family-friendly" rating/text, to see whether `familyFriendly`, `goodWithChildren`, and `goodWithDogs` were being applied consistently. They weren't — the original main-batch Purina cross-check pass had applied this evidence unevenly, adding the badge for some breeds on a bare 4-5/5 rating (e.g. Birman, Turkish Angora) but leaving many other breeds with an equally strong rating unbadged.

**Rule applied for `goodWithDogs`** (using "Likes Other Pets" as the closest available proxy, since very few source pages name dogs specifically): 4-5/5 → add (unless explicit contradicting text), 1-2/5 → leave/confirm absent, 3/5 → treated as neutral, no change. This matches the precedent already set for Birman/Turkish Angora earlier in this file, applied consistently rather than selectively.

**Rule applied for `familyFriendly`/`goodWithChildren`**: judged on the actual qualitative text, not the bare number — a "better suited to older children" caveat was treated as consistent with keeping the badge (as it already had been for Scottish Fold and Manx), while an explicit "not ideal for family homes" or "not suited to homes with children" was treated as a real contradiction. **British Shorthair** is the clearest example of getting this balance wrong on a first pass: Purina rates it only 2/5 "Family-friendly," which initially looked like a contradiction of the existing `familyFriendly` badge — but the actual text ("ideal for... homes with older children, however they are not particularly forgiving of very small children") is the same caveat pattern already accepted for Scottish Fold (5/5, "better with older children") and Manx (4/5, "except very tiny children"). Removing the badge on the strength of the number alone, while keeping it for two other breeds with near-identical text, would have been an inconsistent standard — so the badge was restored, and `goodWithChildren` added alongside it for the same reason.

Corrections applied:
- **Siberian** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/siberian-forest)): added `goodWithChildren` and `goodWithDogs` ("Likes Other Pets: 4/5," "gets along really well with everybody, kids and other pets included").
- **Oriental Shorthair** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/oriental-short-hair)): added `goodWithDogs` ("Likes Other Pets: 5/5").
- **LaPerm** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/la-perms)): added `goodWithDogs` ("Likes Other Pets: 4/5").
- **Bengal** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/bengal)): added `goodWithDogs` ("Likes Other Pets: 5/5").
- **Toyger** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/toyger)): added `goodWithDogs` (4/5, "getting on well with respectful children, and other cats and dogs").
- **Scottish Fold** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/scottish-fold)): added `goodWithDogs` ("Likes Other Pets: 4/5").
- **Kurilian Bobtail** ([Vetstreet](https://www.vetstreet.com/cats/kurilian-bobtail)): added `goodWithChildren` ("may be a good choice for families with children").
- **Munchkin** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/munchkin)): added `goodWithDogs` ("Likes Other Pets: 5/5" — the highest tier, despite the breed's otherwise low family-friendliness score).
- **Khao Manee** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/khao-manee)): added `goodWithDogs` ("Likes Other Pets: 4/5").
- **Norwegian Forest** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/norwegian-forest)): added `goodWithChildren` ("usually get along great with children and other pets").
- **Ragdoll** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/ragdoll)): added `goodWithDogs` ("Likes Other Pets: 4/5").
- **Birman** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/birman)): added `goodWithChildren` ("Family-friendly: 5/5," "can make a wonderful and affectionate family pet" for children who respect boundaries).
- **Somali** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/somali)): added `goodWithDogs` ("Likes Other Pets: 5/5" — notable since this breed's `familyFriendly`/`goodWithChildren` both stay ✗, "Not ideal for family homes").
- **British Shorthair** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/british-shorthair)): added `goodWithDogs` ("Likes Other Pets: 5/5," "will befriend other household pets too, particularly cat-friendly dogs"). `familyFriendly` and `goodWithChildren` re-confirmed rather than removed — see reasoning above.
- **Russian Blue** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/russian-blue)): added `goodWithDogs` ("Likes Other Pets: 4/5").
- **Abyssinian** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/abyssinian)): added `goodWithDogs` ("Likes Other Pets: 5/5").
- **Burmese** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/burmese)): added `goodWithDogs` ("Likes Other Pets: 4/5").
- **Siamese** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/siamese)): added `goodWithDogs` ("Likes Other Pets: 4/5" — kept despite this breed's demanding, attention-competitive personality profile, for consistency with how the same rating tier was treated elsewhere).
- **Cornish Rex** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/cornish-rex)): added `goodWithDogs` ("Likes Other Pets: 5/5," "highly sociable with... other household pets").
- **Devon Rex** ([Purina](https://www.purina.co.uk/find-a-pet/cat-breeds/devon-rex)): added `goodWithDogs` ("Likes Other Pets: 4/5").

Breeds checked and left unchanged because their rating fell in the neutral 3/5 band or the text gave no clear signal either way: Turkish Van, Egyptian Mau, Turkish Angora (children only), Sphynx (2/5, despite ambiguous prose calling it "extremely gregarious" — the numeric score was treated as decisive), Russian Blue/Abyssinian (`familyFriendly`), Himalayan (`goodWithDogs` — "other pets" only, dogs never named), Maine Coon, Chausie, American Curl, American Shorthair, Donskoy, Peterbald, Persian, Lykoi, Savannah, Manx (all already consistent with their source).

## Summary

All 35 breeds now have research-backed `personality`, `lifestyleBadges`, `groomingDifficulty`, `shedding`, `health`, `relatedBreeds`, and `cost` fields, cross-checked against at least one independent second source (Purina UK, Purina NZ, Litter-Robot, or Vetstreet, depending on coverage). The originally-authored fields (`origin`, `weight`, `lifespan`, `coat`, `energy`, `detail`) and all nine lifestyle badges have now been checked against that same source for all 35 breeds — including a dedicated consistency sweep (sixth pass) specifically for `familyFriendly`/`goodWithChildren`/`goodWithDogs`, since the badge evidence in that group had been applied unevenly in earlier passes. Every breed's modal "Further Reading" section now links both its TICA profile and its cross-check source. Sparse fields: `timeline` on Maine Coon, Norwegian Forest, and Turkish Angora. (A `superlative` field/card ribbon — Largest Breed, Oldest Natural Breed, Fastest Domestic Breed, Longest Lifespan, Rare Breed — was removed at the user's request; the underlying facts still appear in each breed's `detail` prose.)

The `originRegion` field and the Breed Origin Map feature (Phase 4d) were removed at the user's request — the map was judged unnecessary.

A few claims were deliberately left unchanged despite a conflicting mention in a cross-check source, because the existing claim is better-documented elsewhere or the new source's mention was too brief/ambiguous to treat as authoritative: Bengal's 1963/early-1980s origin story (vs. Purina's brief "developed in the 1990s"), Somali's US/Canada 1970s origin (vs. Purina's "developed and refined in Britain"), and Turkish Angora's coat-length wording. These are noted above under each breed rather than silently resolved.
