There's a solid body of peer-reviewed work backing exactly what your extension does. Here are the studies most directly useful for your justification, grouped by theme.

## The theoretical foundation: "design friction" / "microboundaries"

The seminal paper here is **Cox, Gould, Cecchinato, Iacovides & Renfree (2016), "Design Frictions for Mindful Interactions: The Case for Microboundaries,"** CHI EA '16. They argue that intentionally introduced microboundaries can have positive effects by disrupting "mindless" automatic interactions and prompting moments of reflection. The mechanism is framed in dual-systems terms: microboundaries actively support the user in shifting from System 1 (automatic) to System 2 (deliberate) processing. This is the exact theoretical claim your extension relies on — even a circumventable barrier breaks the automatic motion long enough for deliberate thought to kick in.

A follow-up is **Lyngs et al. (2019), "Self-Control in Cyberspace: Applying Dual Systems Theory to a Review of Digital Self-Control Tools,"** CHI 2019, which analysed 367 apps and browser extensions from Google Play, Chrome Web, and Apple App stores to identify common design features and intervention strategies and mapped them onto a dual-systems model of self-regulation.

## Browser extensions specifically (most directly relevant to your project)

**Kovacs, Wu & Bernstein (2018), "Rotating Online Behavior Change Interventions Increases Effectiveness But Also Increases Attrition,"** Proc. ACM on Human-Computer Interaction (CSCW '18). This is probably your single best citation — it's a Stanford HCI study of HabitLab, a Chrome extension functionally similar to what you're building. They ran in-the-wild field experiments and found rotating interventions reduced time spent on sites by 34% per day, though attrition increased. Even static (non-rotated) interventions reduced site time meaningfully. Note that HabitLab's interventions are entirely bypassable — users can disable them at any moment — and they still produced large reductions.

A companion paper, **Kovacs et al. (2019), "Do Productivity Interventions Save Time or Just Redirect It?"**, CHI 2019, addresses the obvious objection that blockers just push you to other sites. Using HabitLab data from 5,230 users, when intervention frequency increased on the focal goal, time spent on other applications was held constant or even reduced — i.e., blocked time doesn't simply leak elsewhere on the browser.

**Kovacs, Wu & Bernstein, "Not Now, Ask Later: Users Weaken Their Behavior Change Regimen Over Time, But Expect To Re-Strengthen It Imminently,"** is also worth citing for honesty — analyses of 8,000+ HabitLab users found that, while users typically begin with high-challenge interventions, over time they allow themselves to slip into easier interventions. So you can honestly say "this is known to work, with the caveat that adherence decays."

## Bypassable / "soft commitment" interventions still work

This is the specific claim you want to back up. Two excellent sources:

**Okeke, Sobolev, Dell & Estrin (2018), "Good Vibrations: Can a Digital Nudge Reduce Digital Overload?,"** MobileHCI '18. Participants who exceeded a self-set Facebook time limit got a gentle vibration every five seconds — totally bypassable, no hard block. Users reduced their time on the Facebook app by an average of 20 percent during the intervention week. Crucially, usage returned to baseline once the vibration stopped, which is strong evidence the friction itself was the active ingredient, not some lasting habit shift.

**Hoong (2021), "Self-control and smartphone use: An experimental study of soft commitment devices,"** Journal of Economic Behavior & Organization. A 6-week randomized intervention with 629 participants found that encouragement to adopt application limits significantly reduces smartphone and Facebook use, and the author argues this is direct empirical evidence that soft commitment devices work for limiting phone and social media use. iOS Screen Time limits are completely circumventable — you just tap "Ignore Limit" — and they still produced measurable behaviour change.

For the underlying economics, **Burger, Charness & Lynham (2011) and Bisin & Hyndman** on soft commitment devices show that even non-binding, purely psychological commitments produce real compliance — relevant if a reviewer asks "why would a circumventable tool work at all?"

## Systematic reviews you can cite for breadth

**Biedermann, Schneider & Drachsler (2021), "Digital self‐control interventions for distracting media multitasking: A systematic review,"** Journal of Computer Assisted Learning — covers a wide range of DSCTs including blockers.

**Lyngs et al. (2020) "Self-Control in Cyberspace"** (a longer treatment than the 2019 paper above) and the **"Achieving Digital Wellbeing Through Digital Self-Control Tools" systematic review and meta-analysis (Monge Roffarello & De Russis)** are useful for "the field broadly supports this approach" framing.

## How to use these in your justification

The cleanest argument structure for your extension's docs:

1. **Mechanism** (cite Cox et al. 2016, Lyngs et al. 2019): Habitual visits to time-wasting sites are System 1 / automatic. A microboundary — even a trivial one — disrupts the automaticity and creates a decision point.
2. **Bypassability isn't a bug** (cite Okeke et al. 2018, Hoong 2021): Soft, circumventable interventions produce measurable reductions because the friction-plus-reflection is doing the work, not the inability to bypass.
3. **Quantified effect for browser extensions** (cite Kovacs et al. 2018, 2019): The HabitLab line of work shows ~30%+ reductions in time on target sites via bypassable browser interventions, without displacement to other browser activity.

A search on Google Scholar for "digital self-control tools" or "design friction microboundaries" will surface a dozen more if you want deeper backing. Good luck with the extension.
