# 今回の駅画像の再生成プロンプト

方式：組み込みGPT Image（image_gen）。背景は新規生成、neutralは以前の山本さんを参照し、他の3表情は今回のneutralを参照して編集しました。
背景はtransparent_background=false、人物4枚はtrueです。
旧素材はoutput/replaced-assets/station-20261108-v1/へ退避しました。

## station-bg.png

Use case: photorealistic-natural. Create one photographic background for KindSignal station scene. Ordinary Japanese suburban station indoor concourse, ticket gates clearly recognizable in back, a discreet route information board at right, exit toward bus stops, balanced soft daylight, neither bright blown highlights nor dark shadows. Natural realistic architecture, warm gray surfaces and tactile paving, human eye-level camera, deep spatial perspective. Leave generous open central foreground for a separate elderly character layer. Wide 16:9 landscape. No people anywhere. No prominent invented text, logos, UI, watermarks, no illustration. Target 1920x1080 or larger.

## yamamoto-neutral.png

Use case: identity-preserve. Create refreshed neutral transparent character asset for Yamamoto using the reference as identity. Fictional Japanese woman age 76, same face, straight chin-length gray bob, navy outing jacket over pale blue blouse, beige trousers, canvas shoulder bag. Neutral expression: calmly attentive with a hint of uncertainty, mouth closed, natural age texture, no exaggerated symptoms. Same standing pose and hands: one on bag strap, other slightly open at waist. Centered knee-up 3:4 portrait, preserve exact head and body position, framing and size of reference. Soft balanced daylight from upper left, photorealistic. Genuine fully transparent alpha PNG background, no backdrop, floor, text, watermark or checkerboard painted into image. All later variants will change only facial expression.

## yamamoto-confused.png

Use case: identity-preserve. Edit reference Yamamoto into confused expression only: mild brow furrow, gently parted lips, uncertainty while searching for words, natural subtle emotion. Keep EXACT same fictional Japanese woman age 76, face, gray bob, navy jacket, pale blue blouse, beige trousers, canvas bag, hands, gesture, head angle, body pose, lighting, scale, dimensions and centered knee-up 3:4 framing. Do not change silhouette or position. Genuine transparent alpha PNG, no background, text or props. No exaggerated medical traits.

## yamamoto-cautious.png

Use case: identity-preserve. Edit reference Yamamoto into cautious/hesitant expression only: closed gently pressed lips, slightly lowered worried brows, reserved attentive gaze, not angry or frightened. Keep EXACT same fictional Japanese woman age 76, face identity, gray bob, navy jacket, pale blue blouse, beige trousers, canvas bag, hands, gesture, head angle, body pose, lighting, scale, dimensions and centered knee-up 3:4 framing. Do not change silhouette or position. Genuine transparent alpha PNG, no background, text or props. No exaggerated medical traits.

## yamamoto-relieved.png

Use case: identity-preserve. Edit reference Yamamoto into relieved expression only: soft closed-mouth smile, relaxed brows, gently softened eyes, warm but understated relief. Keep EXACT same fictional Japanese woman age 76, face identity, gray bob, navy jacket, pale blue blouse, beige trousers, canvas bag, hands, gesture, head angle, body pose, lighting, scale, dimensions and centered knee-up 3:4 framing. Do not change silhouette or position. Genuine transparent alpha PNG, no background, text or props. No exaggerated medical traits.

# 前回使用した画像生成プロンプト（履歴）

方式：組み込みGPT Image（image_gen）。CLI/APIキーは使用していません。
背景と通常人物は新規生成。残り3表情はその人物のneutral画像を参照した編集です。
人物生成・編集はすべてtransparent_background=true、背景はfalseです。
生成原本はCodexのgenerated_imagesに残し、完成PNGをこのフォルダーへコピーしています。

## station-bg.png

Use case: photorealistic-natural. One wide 16:9 real photographic background for KindSignal, typical Japanese suburban railway station concourse with warm neutral daylight from left, ticket gates in the background, a simple route information board off to the side and an exit corridor toward bus stops. Human eye-level perspective with spatial depth, open central foreground for a separate portrait layer. No people. Natural materials, clean ordinary station rather than luxury or futuristic building, tactile floor paving. Do not feature detailed text, logos or unnatural signage. No UI or watermark, not illustration. 1920x1080 or larger desired.

## yamamoto-neutral.png

Use case: photorealistic-natural. Single transparent PNG cutout character asset: Yamamoto, fictional Japanese woman age 76 at a suburban train station, distinct from Tanaka. Straight chin-length dark gray bob with a side part, fine oval face, natural wrinkles, navy blue light jacket over pale blue blouse and beige trousers, plain light canvas shoulder bag. Neutral attentive expression with closed lips, dignified independent personality. Natural standing pose, one hand resting on bag strap and the other held slightly open at waist as a subtle communicative gesture. Look toward camera, entire head shoulders hands and upper legs in frame. Centered knee-up portrait 3:4, clear margins. Photorealistic editorial portrait, soft daylight from upper left. Genuine alpha-transparent background, no backdrop, floor, checkerboard texture, text or watermark. Do not exaggerate symptoms. Keep this identity, pose and framing as reference for four facial expressions.

## yamamoto-confused.png

Use case: identity-preserve. Edit this Yamamoto neutral transparent cutout. Change ONLY facial expression to slightly confused: gently knitted brow, lips slightly parted as she searches for words, naturally questioning eyes, subtle not exaggerated. Preserve EXACT same Japanese woman age 76, straight gray bob, face identity, navy jacket, pale blue blouse, beige trousers, canvas bag, hand positions, open hand gesture, body and head pose, scale, light and centered knee-up 3:4 pixel framing. Keep genuine transparent alpha background. No backdrop, text or added props.

## yamamoto-cautious.png

Use case: identity-preserve. Edit the referenced Yamamoto neutral transparent portrait. Change ONLY her face to cautious/hesitant: gently pressed lips, slightly concerned brows, reserved attentive eyes, not angry or frightened. Preserve EXACT same Japanese woman age 76, gray bob haircut, face identity, navy jacket, pale blue blouse, beige trousers, canvas bag, body pose, hand gesture, head angle, lighting, scale, dimensions and centered knee-up 3:4 frame. True transparent alpha background, no backdrop, text or added props.

## yamamoto-relieved.png

Use case: identity-preserve. Edit referenced Yamamoto neutral transparent portrait. Change ONLY facial expression to relieved: gentle warm closed-mouth smile, softened eyes, relaxed brows, natural understated relief. Preserve EXACT Japanese woman age 76, face identity, gray bob, navy jacket, pale blue blouse, beige trousers, canvas bag, both hands and gesture, body/head pose, lighting, dimensions, scale, centered knee-up 3:4 frame. Genuine transparent alpha background; no scene, backdrop, text or added props.

