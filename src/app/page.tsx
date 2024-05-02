import React from "react";
import { Metadata } from "next";
import { Homepage } from "@/components/Homepage";
import { fetchAllApplicationsWithFeatures } from "@/actions";

export const metadata: Metadata = {
  title: "Grants AI - Project Discovery",
};

export default async function Home() {
  const applications = await fetchAllApplicationsWithFeatures();

  return (
    <>
      <main
        className="flex min-h-screen"
        style={{
          background:
            "linear-gradient(rgb(173, 237, 229) -13.57%, rgba(21, 184, 220, 0.47) 45.05%, rgba(0, 0, 0, 0) 92.61%)",
        }}
      >
        <Homepage applications={applications} />
      </main>
    </>
  );
}
