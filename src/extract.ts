import "dotenv/config";

import { fetchAllApplicationsWithFeatures } from "./actions";

const apps = await fetchAllApplicationsWithFeatures();

// console.log(apps);
