# Financial model files

| File | What |
|---|---|
| `model.py` | The model (spec §8 rules). One function `run(...)`, four cases: base, downside, upside, ads_only. |
| `model_out.json` | Output of the last run: `{ base, downside, upside, ads_only }`, each `{ case, rows[], crosses }`. |
| `base_case.csv`, `downside.csv`, `upside.csv` | The same rows as CSV (columns: `month, label, ad_spend, leads, trials_or_demos, new_customers, churned, active, mrr, collected, cumulative, cogs, gm_pct`). |
| `../FINANCIAL_MODEL.md` | Narrative, assumptions with `[V]/[V2]/[U]` tags, tables, unit economics, sensitivities. |

## Re-run

```bash
cd callcatch/docs/model
python3 model.py            # prints each case's rows and crossing month to stdout
```

Python 3.8+, standard library only.

`model.py` currently writes its JSON to an absolute scratch path (`/tmp/claude-0/.../scratchpad/design/model_out.json`) that only exists on the machine where it was authored. Until that line is changed to `json.dump(..., open("model_out.json", "w"), indent=1)` (a one-line edit; the file is outside this doc's ownership), regenerate `model_out.json` with:

```bash
python3 - <<'EOF'
import json, io, contextlib
src = open("model.py").read().split("json.dump(")[0]   # drop the hard-coded dump line (it is the last statement)
ns = {}
with contextlib.redirect_stdout(io.StringIO()):
    exec(src, ns)
json.dump({"base": ns["base"], "downside": ns["down"], "upside": ns["up"], "ads_only": ns["ads_only"]},
          open("model_out.json", "w"), indent=1)
EOF
```

## Regenerate the CSVs

```bash
python3 - <<'EOF'
import json, csv
d = json.load(open("model_out.json"))
cols = ["month","label","ad_spend","leads","trials_or_demos","new_customers","churned","active","mrr","collected","cumulative","cogs","gm_pct"]
for case, fn in [("base","base_case.csv"),("downside","downside.csv"),("upside","upside.csv")]:
    with open(fn, "w", newline="") as f:
        w = csv.writer(f); w.writerow(cols)
        for r in d[case]["rows"]:
            w.writerow(["" if r.get(c) is None else r.get(c, "") for c in cols])
EOF
```

## Changing inputs

`run(name, cpl, lead_to_cust, outbound, annual_take, setup_attach, churn, refund, reinvest, cap, seed_m1=750, seed_m2=250, months=8)`

- `outbound` is a list of 8 monthly outbound closes for Oct … May (month 0 is hard-coded to 2).
- `reinvest` = share of prior-month collected cash spent on ads (0.6 base, 0.4 on the downside track).
- `cap` = monthly ad-spend cap ($2,500). **Note:** the `ads_only` case in the file passes `cap=0`, which clamps ad spend to $0; to model "$1,000 of ads, nothing else" pass `cap=750`. See `FINANCIAL_MODEL.md` §6.
- Constants inside `run`: `ARPU=107`, `ANNUAL=1070`, `SETUP=149`, `VAR=14.8`, `FIXED=90`.

Sensitivity example (what has to be true for a December crossing):

```bash
python3 - <<'EOF'
import io, contextlib
src = open("model.py").read().split("json.dump(")[0]
ns = {}
with contextlib.redirect_stdout(io.StringIO()):
    exec(src, ns)
run = ns["run"]
r = run("upside+annual35", 22, 0.14, [4,6,8,8,8,8,8,8], 0.35, 0.40, 0.035, 0.03, 0.6, 2500)
print(r["rows"][3]["cumulative"], r["crosses"])   # 21709 Dec 2026
EOF
```

## Month-end actuals

On the 1st, substitute actuals for elapsed months (edit the `outbound` list; set `cpl` and `lead_to_cust` to the trailing-month measured values), re-run, and paste the new crossing month into `LAUNCH_PLAN_90_DAYS.md` review notes. Commit `model_out.json` and the CSVs together.
