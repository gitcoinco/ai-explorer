import { getApplications, gitcoinGrantsRoundsRefs } from "@/applications";

export async function fetchAllApplicationsWithFeatures() {
  const applications = await getApplications(gitcoinGrantsRoundsRefs);
  return applications;
}
