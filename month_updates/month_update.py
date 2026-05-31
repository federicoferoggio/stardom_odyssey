import pandas as pd
import random
from collections import Counter


all_companies = pd.read_excel("month_updates/All_Companies.xlsx", sheet_name=None, index_col=0)
background_info = pd.read_excel("month_updates/Background_Information_Families.xlsx", sheet_name=None, index_col=0)

past_events = pd.read_json("month_updates/event_log/opinion_events.json")
past_events.index = past_events["Family"]


def roll_dices(attack_dice, gobble_dice = None, fixed = None):
    attack = sorted(random.randint(1, 10) for _ in range(attack_dice))
    defense = sorted(random.randint(1, 10) for _ in range(gobble_dice or 0))

    def sets(rolls):
        c = Counter(rolls)
        return sorted([[w, h] for h, w in c.items() if w >= 2], key=lambda x: (x[1], x[0]), reverse=True)

    a_sets = sets(attack)
    d_sets = sets(defense)

    for d in d_sets:
        d_w, d_h = d
        for a in a_sets:
            a_w, a_h = a
            if a_w >= 2 and d_h >= a_h:
                a[0] -= 1
                break

    a_sets = [s for s in a_sets if s[0] >= 2]

    return bool(a_sets)

class family:
    def build_fam(self, name, pop_stability, rel_stability):
        pass

    def get_pact_bonus(self, pact):
        return 0

    def __init__(self, name, pop_stability, rel_stability) -> None:
        self.government = None
        self.name = name
        self.build_fam(name, pop_stability, rel_stability)

    def opinion_calc(self, other, curr_month):
        opinion_base = background_info['Type'].loc[self.government, other.government]

        racial_bonus = 0
        raceC_original = background_info['RacesC'].loc[self.name]/100
        raceC_target = background_info['RacesC'].loc[self.name]/100

        for race, perc in raceC_original.items():
            race_opinion = perc * background_info['Races'].loc[race] * raceC_target
            racial_bonus += race_opinion

        religion_bonus = 0
        religionC_original = background_info['ReligionC'].loc[self.name]/100
        religionC_target = background_info['ReligionC'].loc[self.name]/100

        for religion, perc in religionC_original.items():
            religion_opinion = perc * background_info['Religion'].loc[religion] * religionC_target
            religion_bonus += religion_opinion

        dict_of_pacts = {}
        pacts_current = all_companies['Pacts'].loc[self.name].dropna()
        for pact in pacts_current:
            pact_el = str(pact).split(" (")
            pact_type = pact_el[0]
            pact_fam = pact_el[1].split(")")[0]
            dict_of_pacts[pact_type] = pact_fam

        bonuses_from_pacts = {}
        for pact, fam in pacts_current.values():
            if fam == other:
                bonuses_from_pacts[pact] = self.get_pact_bonus(pact)

        past_event_for_family = past_events[past_events["Against"] == other.name].loc[self.name]
        actual_events = {}
        if past_event_for_family:
            for event in past_event_for_family:
                actual_bonus = curr_month - event["Date"]
                current_bonus = event["Opinion"] - actual_bonus if event["Opinion"] > 0 else event["Opinion"] + actual_bonus
                if event["Opinion"] >0 and current_bonus < 0:
                    current_bonus = 0
                if event["Opinion"] <0 and current_bonus > 0:
                    current_bonus = 0
                if current_bonus != 0:
                    actual_events[f"{event["Reason"]} with {other.name}"] = current_bonus

        opinion_base += racial_bonus + religion_bonus + sum(bonuses_from_pacts.values()) + sum(actual_events.values())

        return opinion_base, racial_bonus, religion_bonus, bonuses_from_pacts, actual_events
    
