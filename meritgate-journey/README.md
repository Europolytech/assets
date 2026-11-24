# MeritGate — Interactive Learner Journey

A self-contained responsive, interactive visual guide for MeritGate by EuroPolytech Academy.

## Files

- index.html — standalone website, complete CSS and JavaScript, no build step.
- meritgate-logo.svg — official MeritGate shield supplied by the Academy, self-contained with an embedded optimised WebP image; used in the site header, hero and favicon.
- zoho-embed.html — copy/paste Zoho Sites iframe snippet, with secure auto-resizing.
- README.md — these instructions.

## GitHub Pages deployment

The files are committed to the public repo:
https://github.com/Europolytech/assets/tree/main/meritgate-journey

1. Open https://github.com/Europolytech/assets/settings/pages
2. Under Build and deployment, select Deploy from a branch if necessary.
3. Select branch main, folder /(root), then Save.
4. Once the Pages deployment has succeeded, the expected URL is:
   https://europolytech.github.io/assets/meritgate-journey/
5. Open the link to confirm it works before embedding.

The URL is a **predicted Pages address**, not proof Pages is already active.

## Embed in Zoho Sites

1. Open the MeritGate landing page in the Zoho Sites editor.
2. Add a Code Snippet element in a full-width section.
3. Open zoho-embed.html and paste the entire content into the code editor.
4. Save and publish. Test on desktop and a mobile phone.
5. The provided embed uses the query parameter ?embed=1 to hide the mini-site header and footer.
6. The embedded page posts its content height to the parent. The parent listener verifies the GitHub Pages origin and iframe identity before resizing.

If Zoho strips embedded scripts, the iframe uses its fallback height and internal scrolling.
If the expected GitHub Pages URL shows 404, review the Pages settings and deployment progress.

## Visual and functional features

- Six clickable chapters: Discover, Register, Apply, Merit review, Start together, Progress.
- Keyboard-accessible navigation with Arrow, Home and End keys.
- Chapter-specific details: learner touchpoints, behind-the-scenes operations, milestones and assurances.
- Scholarship fork: on-campus Porto scholar versus online learner, both starting the same live class timetable.
- Illustrated 2027 milestone timeline: planned merit-based scholarship results on 12 March, synchronous hybrid intake on 12 April, and the eight-week Porto experience during April–June.\n- Illustrated hybrid classroom: on-campus scholars and online students share live teaching, with Moodle supporting asynchronous learning and assignments.\n- Both paths converge on successful assessment and qualification progression.
- Navy #061C32, teal #006F69, gold #E8C369, ivory #FAF9F6, slate #526174.
- Reduced motion support, semantic markup and visible keyboard focus.
- Direct free-expression-of-interest button using the confirmed Zoho Forms URL.
- Zero cookies, no external fonts, third-party scripts or analytics by default.

## Compliance and editorial note

The page explains the **proposed programme experience**. It is not a binding admissions offer or scholarship guarantee. Paid enrolment, the final scholarship package, residential activity and academic delivery remain subject to the relevant authorisations and published policies.

The first academic intake is planned for **12 April 2027**, with merit-based scholarship results planned for **12 March 2027**. Both participation modes start together in synchronous hybrid classes, supported by Moodle. These dates remain subject to applicable authorisations and published programme terms. Any qualification requires successful assessment. Scholarship selection is merit-based rather than random. Study and travel permissions are assessed separately.

The current education and scholarship information is at:
https://www.europolytech.academy/meritgate

## Updating content

Chapter content lives in the JavaScript data array near the end of index.html.
Two scholarship outcomes are in the routes object.
Modify published programme figures or scholarship details only when the authoritative policies have been approved.

The official MeritGate shield logo is used throughout the page in place of the previous placeholder monogram and gateway illustration. The `meritgate-logo.svg` asset is self-contained and loads locally from the same GitHub Pages directory. Keep this logo file alongside `index.html` when deploying.
