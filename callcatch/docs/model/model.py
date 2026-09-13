import json
def run(name, cpl, lead_to_cust, outbound, annual_take, setup_attach, churn, refund, reinvest, cap, seed_m1=750, seed_m2=250, months=8):
    ARPU=107.0; ANNUAL=1070.0; SETUP=149.0; VAR=14.8; FIXED=90.0
    rows=[]; base_m=0.0; base_a=0.0; cum=0.0; prev_col=0.0; carry_cust=0.0; carry_cash=0.0
    # month 0 (Sep 14-30): outbound only
    m0_cust=2; m0_ann=m0_cust*annual_take; m0_mon=m0_cust-m0_ann
    col0=m0_ann*ANNUAL*(1-refund)+m0_mon*(ARPU+setup_attach*SETUP)*(1-refund)
    base_a+=m0_ann; base_m+=m0_mon; cum+=col0; prev_col=col0
    rows.append(dict(month=0,label="Sep 14-30 2026",ad_spend=0,leads=0,new_customers=m0_cust,churned=0,active=round(base_m+base_a,1),mrr=round(base_m*ARPU+base_a*ANNUAL/12),collected=round(col0),cumulative=round(cum),cogs=round((base_m+base_a)*VAR+FIXED),gm_pct=None))
    for m in range(1,months+1):
        spend = seed_m1 if m==1 else (seed_m2 + reinvest*prev_col if m==2 else reinvest*prev_col)
        spend=min(spend,cap)
        leads=spend/cpl
        ad_cust=leads*lead_to_cust
        ref = 0.03*(base_m+base_a) if m>=3 else 0
        new=ad_cust+outbound[m-1]+ref
        # cash timing: 50% of ad customers pay in-month (pay-now on demo), 50% next month (trial); outbound/referral 70% in-month
        paying_now = ad_cust*0.5 + (outbound[m-1]+ref)*0.7 + carry_cust
        carry_cust = ad_cust*0.5 + (outbound[m-1]+ref)*0.3
        churned = base_m*churn
        base_m -= churned
        recurring = base_m*ARPU  # existing monthly customers renew
        ann_new = paying_now*annual_take; mon_new = paying_now-ann_new
        new_cash = ann_new*ANNUAL*(1-refund) + mon_new*(ARPU+setup_attach*SETUP)*(1-refund)
        col = recurring + new_cash
        base_a += ann_new; base_m += mon_new
        active=base_m+base_a
        cogs=active*VAR+FIXED
        rev_norm = base_m*ARPU + base_a*ANNUAL/12  # MRR
        gm = (rev_norm-cogs)/rev_norm*100 if rev_norm>0 else None
        cum+=col; prev_col=col
        rows.append(dict(month=m,label=["Oct 2026","Nov 2026","Dec 2026","Jan 2027","Feb 2027","Mar 2027","Apr 2027","May 2027"][m-1],ad_spend=round(spend),leads=round(leads,1),trials_or_demos=round(leads*0.25,1),new_customers=round(new,1),churned=round(churned,1),active=round(active,1),mrr=round(rev_norm),collected=round(col),cumulative=round(cum),cogs=round(cogs),gm_pct=round(gm,1) if gm else None))
    cross=next((r for r in rows if r["cumulative"]>=20000),None)
    return dict(case=name,rows=rows,crosses=cross["label"] if cross else "not within horizon")
base=run("base",30,0.10,[3,5,6,7,7,7,7,7],0.20,0.30,0.045,0.05,0.6,2500)
down=run("downside",45,0.07,[2,3,4,4,4,4,4,4],0.12,0.20,0.06,0.08,0.6,2500)
up=run("upside",22,0.14,[4,6,8,8,8,8,8,8],0.30,0.40,0.035,0.03,0.6,2500)
ads_only=run("ads_only_no_reinvest",30,0.10,[0]*8,0.0,0.0,0.045,0.05,0.0,0,seed_m1=750,seed_m2=250)
for c in (base,down,up,ads_only):
    print(c["case"],"crosses:",c["crosses"])
    for r in c["rows"]: print(r)
    print()
ads_only_1000=run("ads_only_1000_no_reinvest",30,0.10,[0]*8,0.0,0.0,0.045,0.05,0.0,750,seed_m1=750,seed_m2=250)
import os
out=os.path.join(os.path.dirname(os.path.abspath(__file__)),"model_out.json")
json.dump(dict(base=base,downside=down,upside=up,ads_only=ads_only,ads_only_1000=ads_only_1000),open(out,"w"),indent=1)
