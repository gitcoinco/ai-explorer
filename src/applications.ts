import Keyv from "keyv";
import SqliteKeyv from "@keyv/sqlite";
import OpenAI from "openai";
import throttle from "p-throttle";

const cache = new Keyv({
  store: new SqliteKeyv("sqlite://cache.db"),
  namespace: "1",
});

const INDEXER_URL = "https://grants-stack-indexer-v2.gitcoin.co";

type RoundRef = {
  chainId: number;
  roundId: number;
};

export const gitcoinGrantsRoundsRefs: RoundRef[] = [
  { chainId: 42161, roundId: 26 },
  { chainId: 42161, roundId: 27 },
  { chainId: 42161, roundId: 25 },
  { chainId: 42161, roundId: 23 },
  { chainId: 42161, roundId: 29 },
  { chainId: 42161, roundId: 24 },
  { chainId: 42161, roundId: 31 },
  { chainId: 42161, roundId: 28 },
  { chainId: 10, roundId: 9 },
];

export interface Round {
  id: string;
  chainId: number;
  matchAmountInUsd: string;
  roundMetadata: {
    name: string;
    eligibility: {
      description: string;
      requirements: { requirement: string }[];
    };
  };
  applicationMetadata: unknown;
  applications: Application[];
}

export interface Features {
  short_description: string;
  enhanced_project_description: string;
  tags: string[];
  technology_stack: string[];
  project_age: string;
  users_count: string;
  team_size: string;
  regions: string[];
  is_dao: boolean;
}

export interface Application {
  id: string;
  refId: string;
  roundId: string;
  chainId: number;
  projectId: string;
  round: Round;
  features: Features;
  tags: string[];
  totalAmountDonatedInUsd: number;
  totalDonationsCount: number;
  metadata: {
    application: {
      answers: (
        | {
            question: string;
            answer: string;
          }
        | {
            question: string;
            encryptedAnswer: string;
          }
      )[];
      project: {
        logoImg: string;
        title: string;
        bannerImg: string;
        userGithub: string;
        projectGithub: string;
        projectTwitter: string;
        description: string;
      };
    };
  };
}

export async function getApplications(
  refs: RoundRef[],
): Promise<Application[]> {
  const applications = (
    await Promise.all(
      refs.map((ref) => {
        const key = `applications:${ref.chainId}:${ref.roundId}`;
        return cache.get(key).then((cached) => {
          if (cached) {
            return cached as Application[];
          }
          throw Error(`Cache miss for ${key}`);
        });
      }),
    )
  ).flat();

  const enrichedApplications = (
    await Promise.all(
      applications.map(async (app) => {
        const key = `application:${app.chainId}:${app.roundId}:${app.id}:features`;
        const features: Features | null = await cache.get(key);

        if (features === null) {
          return [];
        }

        const tags = [
          features.tags,
          features.regions,
          features.team_size,
          features.technology_stack,
          features.project_age,
          features.users_count,
          features.is_dao ? "DAO governed" : undefined,
        ]
          .filter(Boolean)
          .flat() as string[];

        return [
          {
            ...app,
            tags,
            features,
            refId: `${app.chainId}:${app.roundId}:${app.id}`,
          },
        ];
      }),
    )
  ).flat();

  enrichedApplications.sort((a, b) =>
    a.metadata.application.project.title.localeCompare(
      b.metadata.application.project.title,
    ),
  );

  return enrichedApplications;
}

export async function refreshApplications(refs: RoundRef[]): Promise<void> {
  const promises: Promise<Application[]>[] = [];

  for (const ref of refs) {
    const key = `applications:${ref.chainId}:${ref.roundId}`;

    console.log(
      `Fetching applications for round ${ref.chainId}:${ref.roundId}`,
    );

    const response = fetch(`${INDEXER_URL}/graphql`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query: `
          query {
            applications(filter: {
              chainId: { equalTo: ${ref.chainId} }
              roundId: { equalTo: "${ref.roundId}" }
              status: { equalTo: APPROVED }
            }) {
              id
              chainId
              roundId
              projectId
              metadata
              totalAmountDonatedInUsd
              totalDonationsCount
              round {
                id
                chainId
                roundMetadata
                matchAmountInUsd
                applicationMetadata
              }
            }
          }
        `,
      }),
    });

    promises.push(
      response
        .then((r) => r.json())
        .then(async (data) => {
          await cache.set(key, data.data.applications, 1000 * 60 * 60 * 24);
          return data.data.applications;
        }),
    );
  }

  const openai = new OpenAI({ apiKey: process.env.NEXT_APP_OPENAI_API_KEY });

  const applicationChunks = await Promise.all(promises);
  const applications = applicationChunks.flat();

  console.log("Fetched", applications.length, "applications");

  let progress = 0;

  await Promise.all(
    applications.map(async (app, _i, total) => {
      const key = `application:${app.chainId}:${app.roundId}:${app.id}:features`;
      if (!(await cache.has(key))) {
        const features = await throttledExtractFeaturesFromApplication(
          openai,
          app,
        );
        cache.set(key, features, 1000 * 60 * 60 * 24);
        console.log("Extracted", progress, "of", total.length, "applications");
      } else {
        console.log(
          "Extracted",
          progress,
          "of",
          total.length,
          "applications (cached)",
        );
      }
      progress++;
    }),
  );
}

const throttledExtractFeaturesFromApplication = throttle({
  limit: 1,
  interval: 1000,
})(extractFeaturesFromApplication);

async function extractFeaturesFromApplication(
  openai: OpenAI,
  application: Application,
): Promise<Features | null> {
  const key = `application:${application.chainId}:${application.roundId}:${application.id}:features`;
  const cached = await cache.get(key);

  if (cached) {
    return cache.get(key);
  }

  console.log(
    `Extracting features for application ${application.chainId}:${application.roundId}:${application.id}`,
  );

  const completion = await openai.chat.completions
    .create({
      temperature: 0,
      tools: [
        {
          type: "function",
          function: {
            name: "save_features",
            description:
              "Extracts and saves key features from project descriptions, emphasizing deep contextual understanding and semantic accuracy.",
            parameters: {
              type: "object",
              properties: {
                short_description: {
                  type: "string",
                  description: "Short project description",
                  maxLength: 100,
                },
                is_dao: {
                  type: "boolean",
                  description: "The project is governed by a DAO.",
                },
                enhanced_project_description: {
                  description:
                    "Enhanced project description, summary of key features and intended impact",
                  type: "string",
                  maxLength: 1000,
                },
                tags: {
                  type: "array",
                  description: "Tags that precisely describe the project.",
                  items: {
                    type: "string",
                    examples: [
                      "Has GitHub",
                      "Has Twitter",
                      "Has Discord",
                      "Has funding",
                      "VC backed",
                      "Has traction",
                      "Open source",
                      "Non-profit",
                      "For-profit",
                      "Proven impact",
                      "Has community",
                      "Has token",
                      "Female-led",
                      "First time founder",
                      "Received previous grant",
                      "No previous grant",
                      "Has impact metrics",
                      "Has images",
                      "Has video",
                      "Has traction",
                      "Has demo",
                      "Has product",
                      "Has audit",
                      "DAO governed",
                      "Has roadmap",
                      "dApp",
                      "ReFi",
                      "Climate",
                      "Health",
                      "Education",
                      "Economic empowerment",
                      "Equality",
                      "Justice",
                      "Open source",
                      "Infrastructure",
                      "Is a community",
                      "Arts",
                      "Media",
                      "Disaster relief",
                      "Governance",
                      "Sustainability",
                      "Conservation",
                      "Carbon offsetting",
                      "Renewable energy",
                      "Environment",
                      "Green tech",
                      "Equality",
                      "Financial inclusion",
                      "Financial literacy",
                      "Financial services",
                      "Food tech",
                      "NFT",
                      "Developer tools",
                      "ENS",
                      "Layer 2",
                      "DeFi",
                      "Privacy",
                      "Security",
                      "Education",
                      "Base",
                      "Optimism",
                      "Arbitrum",
                      "AI",
                      "LLM",
                      "Polygon",
                      "Fiat",
                      "Wallet",
                      "dMRV",
                      "Protocol",
                    ],
                  },
                },
                technology_stack: {
                  type: "array",
                  description:
                    "Technologies used in the project, e.g. 'Rust', 'EVM', 'Blockchain', 'Optimistic Rollups'",
                  items: {
                    type: "string",
                  },
                },
                project_age: {
                  type: "string",
                  enum: [
                    "",
                    "less than 1 year old",
                    "1-2 years old",
                    "2-3 years old",
                    "3-5 years old",
                    "5-10 years old",
                    "10+ years old",
                  ],
                },
                users_count: {
                  type: "string",
                  enum: [
                    "",
                    "1-100 users",
                    "100-1000 users",
                    "1000-2000 users",
                    "2000+ users",
                  ],
                },
                team_size: {
                  type: "string",
                  enum: [
                    "",
                    "Solo founder",
                    "1-10 team members",
                    "11-50 team members",
                    "51-200 team members",
                    "200+ team members",
                  ],
                },
                regions: {
                  type: "array",
                  description:
                    "Regions or countries the project is based in or focused on.",
                  items: {
                    type: "string",
                  },
                },
              },
            },
          },
        },
      ],
      messages: [
        {
          role: "system",
          content:
            "Carefully analyze project descriptions to accurately extract and save features. Focus on the semantic relationships and ensure that tags reflect the project’s core functionalities and goals.",
        },
        {
          role: "user",
          content: `
        Evaluate and tag the following project data using the 'save_features' function. Each feature should be substantiated by a clear and direct relationship in the text:

        - CALL the save_features function only ONCE.
        - Avoid superficial tagging based solely on keyword presence; ensure each tag is supported by a clear contextual link.
        - For ambiguous cases, do not add the tag.
        - If a feature is mentioned but does not fundamentally relate to the project’s operations or goals, it should not be tagged.
        - Tags will be used for users to search for relevant projects, include tags that are likely to be searched for.
        - Include tags that are not necessarily keyword based, like 'DAO governed', 'VC backed', 'Non-profit', 'For-profit', 'Has community'.
        - Include tags about the people behind the project, like 'Solo founder', 'First time founder', 'Small team'
        - Keep tags short.
        - Limit to 5-10 tags.
        - Don't use title casing for tags. i.e. 'Climate solutions' not 'Climate Solutions', DAO instead of DAo.
        - Example of tagging:
          If a project description mentions a 'wallet,' tag as 'Wallet' only if the description involves wallet functionalities like transactions or storage.
          If a project mentions working with DAOs but does not mention itself being governed by a DAO, do not tag as 'DAO governed'.
          If the amount of users is not explicitly mentioned, do not tag user count.


        Project Description:
        ${application.metadata.application.project.description}

        Project GitHub: ${application.metadata.application.project.projectGithub}
        User GitHub: ${application.metadata.application.project.userGithub}
        Project Twitter: ${application.metadata.application.project.projectTwitter}

        Project Answers:
        ${application.metadata.application.answers
          .flatMap((answer) =>
            "answer" in answer
              ? [`Q: ${answer.question}\nA: ${answer.answer}`]
              : [],
          )
          .join("\n")}
        `,
        },
      ],
      model: "gpt-3.5-turbo",
    })
    .catch((e) => {
      console.error(e);
      return null;
    });

  if (!completion) {
    return null;
  }

  const args =
    completion.choices[0]?.message?.tool_calls?.[0].function.arguments;

  if (!args) {
    return null;
  }

  const parsedArgs = JSON.parse(args);

  console.log(parsedArgs);

  await cache.set(key, parsedArgs, 60 * 60 * 24);

  return parsedArgs;
}
