// Where the suggested daily targets come from (App Review 1.4.1, 30 October 2026: "include citations in the app of the sources of the recommendations or
// information, such as links to those sources"). Only sources whose page was opened and read are listed; a rule that has no published source is NOT given
// one: the screen says it is Numbite's own starting point (see SourcesBody). Add a source here only after reading it.

export interface TargetSource {
  id: "mifflin" | "nhs-calories" | "issn-protein";
  /** The reference as a reader would cite it. Titles of papers and pages are proper names: not translated. */
  citation: string;
  /** What the link opens: the page's own address, checked to answer on the date below. */
  url: string;
}

export const TARGET_SOURCES: readonly TargetSource[] = [
  {
    id: "mifflin",
    citation: "Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO. A new predictive equation for resting energy expenditure in healthy individuals. American Journal of Clinical Nutrition, 1990;51(2):241–247.",
    url: "https://pubmed.ncbi.nlm.nih.gov/2305711/",
  },
  {
    id: "nhs-calories",
    citation: "NHS. Understanding calories.",
    url: "https://www.nhs.uk/live-well/healthy-weight/managing-your-weight/understanding-calories/",
  },
  {
    id: "issn-protein",
    citation: "Jäger R, Kerksick CM, Campbell BI, et al. International Society of Sports Nutrition Position Stand: protein and exercise. Journal of the International Society of Sports Nutrition, 2017;14:20.",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/",
  },
];

/** The day the three pages above were opened and read (ISO date). */
export const TARGET_SOURCES_CHECKED = "2026-10-30";

/** The only hosts a source link may point to (a test fails any other). */
export const TARGET_SOURCE_HOSTS: readonly string[] = ["pubmed.ncbi.nlm.nih.gov", "pmc.ncbi.nlm.nih.gov", "www.nhs.uk"];

export const targetSource = (id: TargetSource["id"]): TargetSource => {
  const s = TARGET_SOURCES.find((x) => x.id === id);
  if (!s) throw new Error(`unknown target source ${id}`);
  return s;
};
