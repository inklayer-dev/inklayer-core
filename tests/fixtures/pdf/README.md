# PDF test fixtures

`pr6531_1.pdf` is copied from Mozilla's Apache-2.0 licensed PDF.js test suite.
Its user password is `asdfasdf`; integration tests deliberately submit `qwerty`
first to verify the incorrect-password retry path.

Source: <https://github.com/mozilla/pdf.js/blob/master/test/pdfs/pr6531_1.pdf>

`mixed-pages.pdf` is generated deterministically by
`examples/vanilla/src/sample-pdf.ts`. It is the CORE-021 fixture shared by
PDF.js import, browser Canvas/TextLayer/annotation/thumbnail checks, watermark,
print, and export tests. It contains three different MediaBox/CropBox pairs,
0/90/270-degree page rotations, searchable text, and native Highlight, Square,
and Underline annotations.

`long-document.pdf` is reproduced byte-for-byte by the same Vanilla fixture
generator. Its 96 searchable pages drive CORE-022 search, thumbnail churn,
virtual page mounting, zoom reconstruction, generation cancellation, document
replacement, and final resource-release checks without timing thresholds.
