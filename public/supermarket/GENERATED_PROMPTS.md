# 実際に使用した画像生成プロンプト

方式：組み込みGPT Image（image_gen）。CLI/APIキーは使用していません。
背景と通常人物は新規生成。残り3表情はその人物のneutral画像を参照した編集です。
人物生成・編集はすべてtransparent_background=true、背景はfalseです。
生成原本はCodexのgenerated_imagesに残し、完成PNGをこのフォルダーへコピーしています。

## supermarket-bg.png

Use case: photorealistic-natural. Asset: KindSignal supermarket background, one image. Wide 16:9 photorealistic editorial photograph of a typical clean Japanese neighborhood supermarket tea aisle, neatly stocked Japanese tea packages on shelves, warm natural overhead lighting and convincing aisle depth. Eye-level camera, central open foreground space for a separately composited elderly customer. No people. Subtle packaging text only, no conspicuous signs, logos, UI, watermarks. Real photographic textures, no illustration. Desired 1920x1080 or larger.

## tanaka-neutral.png

Use case: photorealistic-natural. Single transparent PNG cutout character asset for KindSignal: Tanaka, fictional Japanese woman age 78, warm approachable but self-possessed personality. Natural aged skin, short softly waved silver-gray hair, no glasses, muted dusty-rose cardigan over ivory blouse, dark taupe trousers, small brown crossbody bag. Standing facing camera slightly turned, hands calmly held together near waist, entire head, shoulders, hands and upper legs visible; knee-up 3:4 portrait centered with generous clear margins. Neutral attentive relaxed expression, mouth closed. Real editorial portrait photography, soft natural supermarket-compatible light from upper left, realistic fabric texture. Genuine fully transparent alpha background, no scene, no floor, no checkerboard drawn into pixels, no text or watermark. Do not exaggerate symptoms or stereotypes. This is the identity and fixed pose reference for four facial expressions.

## tanaka-confused.png

Use case: identity-preserve. Edit the provided Tanaka neutral cutout into the confused expression. Change ONLY her facial expression: slight brow furrow and gently questioning lips, mildly unsure, dignified, natural, not exaggerated. Preserve the exact same Japanese woman age 78, face identity, hair, dusty rose cardigan, ivory blouse, trousers, bag, hands, body pose, head angle, lighting, pixel framing, dimensions, silhouette and scale. Single centered knee-up 3:4 transparent PNG asset. Maintain genuine alpha transparency; no background or text.

## tanaka-cautious.png

Use case: identity-preserve. Edit the referenced Tanaka neutral transparent cutout. Change ONLY facial expression to cautiously guarded, gently pressed lips and slightly lowered brows, not angry. Preserve exact same Japanese woman age 78, identity, short silver hair, dusty rose cardigan, ivory blouse, trousers, brown bag, hands, body pose, head angle, light, dimensions, centered knee-up 3:4 framing and scale. Keep genuine alpha transparency, no backdrop, no text. Subtle natural emotions only.

## tanaka-relieved.png

Use case: identity-preserve. Edit the referenced Tanaka neutral transparent cutout. Change ONLY facial expression to relieved warm gentle smile, softened eyes, relaxed brows. Preserve exact same Japanese woman age 78, identity, short silver hair, dusty rose cardigan, ivory blouse, trousers, brown bag, hands, body pose, head angle, light, dimensions, centered knee-up 3:4 framing and scale. Keep genuine alpha transparency, no backdrop, no text. Subtle natural emotions only.

