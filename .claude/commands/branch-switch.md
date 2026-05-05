---
description: Lista feature branches abiertas y switchea a la elegida
---

El usuario quiere retomar una feature existente. Seguí este flujo:

1. **Verificá el working tree**:
   - `git status --short`. Si hay cambios sin commitear, avisale al usuario antes de switchear — un checkout puede conflictuar o pisar trabajo.

2. **Actualizá referencias remotas**:
   ```bash
   git fetch origin --prune
   ```

3. **Listá feature branches no mergeadas a `develop`** (locales + remotas, excluyendo `main`/`develop`/`master`):
   ```bash
   git for-each-ref --no-merged=origin/develop \
     --sort=-committerdate \
     --format='%(refname:short) | %(committerdate:relative) | %(subject)' \
     refs/heads/ refs/remotes/origin/ \
     | grep -vE '^(main|develop|master|origin/main|origin/develop|origin/master|origin/HEAD) ' \
     | head -15
   ```

4. **Pedile al usuario que elija** cuál retomar (usá `AskUserQuestion` si hay entre 2 y 4 candidatas claras, sino mostrá la lista y que indique).

5. **Switcheá**:
   - Si la rama elegida es local: `git checkout <branch>`.
   - Si es remota (`origin/<branch>`) sin tracking local: `git checkout -b <branch> origin/<branch>`.
   - Si es local pero está desactualizada vs origin: ofrecé `git pull --ff-only` después del checkout.

6. Reportá: rama actual, último commit, y si está por detrás de `origin/develop` (para sugerir `/sync`).
