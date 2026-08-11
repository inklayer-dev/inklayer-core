# Performance Baseline

Run the reproducible local baseline with:

```bash
npm run benchmark
```

Environment measured on 2026-08-11: macOS arm64, Node 24.18.0, Playwright
Chromium 151.0.7922.34. CPU timings are medians of five rounds for domain/format
workloads; browser timings are one warmed local run. Values are baselines, not
cross-machine budgets.

## Transitive library entry bytes

| Entry | Bytes |
|---|---:|
| Viewer | 39,327 |
| Annotation | 69,264 |
| PDF export | 32,600 |
| Excel export | 16,741 |

The calculation follows unique static relative ESM imports for each entry. PDF.js,
Konva, pdf-lib, and ExcelJS are external package dependencies, so the numbers
describe Core's entry code. Viewer contains neither pdf-lib nor ExcelJS.

## Runtime baseline

| Workload | Time |
|---|---:|
| Repository `replaceAll`, 100 annotations | 0.48 ms |
| Repository `replaceAll`, 1,000 annotations | 3.69 ms |
| PDF.js normalized import, 100 annotations | 1.88 ms |
| PDF dictionary export, 100 annotations | 6.68 ms |
| Annotation Engine create/destroy, 100 cycles | 1.11 ms |
| Browser initial two-instance PDF load | 228.35 ms |
| Browser zoom + page reattach | 99.89 ms |
| Browser destroy + two-instance remount | 126.87 ms |

After forced GC, 100 detached Annotation Engine lifecycle cycles measured a
72,680-byte heap delta. This includes GC noise and warmed runtime caches and is not interpreted
as a leak by itself; the lifecycle tests separately assert root, repository,
listener, DOM, and Stage cleanup.

## Performance design constraints

- repository page queries use a maintained page index;
- pointer move does not serialize the Stage;
- invisible pages can be detached independently;
- outline/search work and thumbnail/TextLayer resources are document-generation
  scoped and released on replacement or destroy;
- renderer JSON crosses one centralized validation boundary;
- metadata inspection loads PDF bytes once per requested inspection;
- format libraries are secondary/dynamic in the Vanilla application;
- optimization changes require rerunning this baseline rather than relying on
  bundle intuition alone.
