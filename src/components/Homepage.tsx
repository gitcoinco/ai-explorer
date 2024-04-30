"use client";
import { ReactTags, Tag } from "react-tag-autocomplete";
import { Application, fetchAllApplicationsWithFeatures } from "@/actions";
import Image from "next/image";
import React from "react";

export function Homepage() {
  const [applications, setApplications] = React.useState<Application[] | null>(
    null,
  );
  const applicationsWithTags = React.useMemo(() => {
    return applications?.map((application) => ({
      ...application,
      lowerCaseTags: application.tags.map((tag) => tag.toLowerCase()),
    }));
  }, [applications]);

  const [selected, setSelected] = React.useState<
    { value: string; label: string }[]
  >([]);
  const availableTags = React.useMemo(() => {
    const tags: Record<string, { tag: string; count: number }> = {};

    function addTag(tag: string) {
      const lowerCaseTag = tag.toLowerCase();
      if (tags[lowerCaseTag]) {
        tags[lowerCaseTag].count++;
      } else {
        tags[lowerCaseTag] = { tag, count: 1 };
      }
    }

    applications?.forEach((application) => {
      if (application.tags) {
        for (const tag of application.tags) {
          addTag(tag);
        }
      }
    });

    return Object.entries(tags)
      .sort((a, b) => b[1].count - a[1].count)
      .map((tag) => ({
        value: tag[0],
        label: tag[1].tag,
      }));
  }, [applications]);

  const filteredApplications = React.useMemo(() => {
    if (!applicationsWithTags) {
      return [];
    }

    return applicationsWithTags.filter((application) =>
      selected.every((tag) => application.lowerCaseTags.includes(tag.value)),
    );
  }, [applicationsWithTags, selected]);

  const onAdd = React.useCallback(
    (newTag: Tag) => {
      // @ts-ignore
      setSelected([...selected, newTag]);
    },
    [selected],
  );

  const onDelete = React.useCallback(
    (tagIndex: number) => {
      setSelected(selected.filter((_, i) => i !== tagIndex));
    },
    [selected],
  );

  React.useEffect(() => {
    fetchAllApplicationsWithFeatures().then((applications) => {
      setApplications(applications);
    });
  }, []);

  if (applications === null) {
    return (
      <div className="w-full flex items-center justify-center">
        <div className="text-2xl text-[#00433b] flex flex-col items-center justify-center">
          <div className="w-8 h-8 mb-8 border-4 border-white/30 border-t-[#00433b] rounded-full animate-spin"></div>
          <div>Loading projects...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-screen-xl py-24 w-full">
      <div className="pb-12">
        <h1 className="font-bold text-3xl pb-2">Discover Projects with AI</h1>
        <h2>Find the best projects to donate to based on your interests.</h2>
        <h2 className="font-bold pt-4">
          Note: this app is experimental and may not be accurate.
        </h2>
      </div>
      <ReactTags
        placeholderText="Click here to start!"
        selected={selected}
        suggestions={availableTags}
        onAdd={onAdd}
        onDelete={onDelete}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mt-16">
        {filteredApplications &&
          filteredApplications.map((application) => (
            <div
              key={application.refId}
              className="rounded-3xl bg-white shadow-lg overflow-hidden w-full hover:opacity-90 transition"
            >
              <a
                target="_blank"
                href={`https://explorer.gitcoin.co/#/round/${application.chainId}/${application.roundId}/${application.id}`}
                data-track-event="project-card"
              >
                <div className="w-full relative">
                  <div>
                    <Image
                      className="bg-black h-[120px] w-full object-cover rounded-t"
                      width={960}
                      height={320}
                      src={`https://d16c97c2np8a2o.cloudfront.net/ipfs/${application.metadata.application.project.bannerImg}?img-height=320`}
                      alt="Project Banner"
                      onError={(e) => {
                        // @ts-ignore
                        e.target.srcset =
                          "https://explorer.gitcoin.co/share.png";
                      }}
                    />
                  </div>
                </div>
                <div className="p-6 relative">
                  <Image
                    className="bg-white object-cover rounded-full border-solid border-2 border-white absolute -top-[24px] "
                    width={48}
                    height={48}
                    src={`https://d16c97c2np8a2o.cloudfront.net/ipfs/${application.metadata.application.project.logoImg}?img-height=96`}
                    onError={(e) => {
                      // @ts-ignore
                      e.target.srcset =
                        "https://explorer.gitcoin.co/static/media/default_logo.724472a8d8c6e410ed8c.png";
                    }}
                    alt="Project Logo"
                  />
                  <div className="truncate pt-4 pb-2">
                    {application.metadata.application.project.title}
                  </div>
                  <div className="text-sm md:text-base text-ellipsis line-clamp-4 text-gray-400 leading-relaxed min-h-[96px]">
                    <div className="text-sm line-clamp-4">
                      {application.features.short_description}
                    </div>
                  </div>
                  <div className="mt-4 flex gap-x-6 grid grid-cols-2 gap-y-4">
                    <div className="text-xs col-span-2 truncate">
                      <div className="pb-1">Round</div>
                      <span className="truncate text-gray-400 max-w-full whitespace-nowrap">
                        {application.round.roundMetadata.name}
                      </span>
                    </div>
                    <div className="text-xs">
                      <div className="pb-1">Total donations</div>
                      <span className="truncate text-gray-400">
                        ${application.totalAmountDonatedInUsd.toFixed(2)}
                      </span>
                    </div>
                    <div className="gray text-xs">
                      <div className="pb-1">Donation count</div>
                      <span className="truncate text-gray-400">
                        {application.totalDonationsCount}
                      </span>
                    </div>
                  </div>
                </div>
                <div
                  className="border-t overflow-auto pt-2 pb-4 px-4 flex items-center"
                  style={{ scrollbarWidth: "thin" }}
                >
                  {application.tags.slice(0, 1).map((tag) => (
                    <div
                      key={tag}
                      className="block bg-gray-200 text-xs px-3 py-2 rounded-xl m-1 whitespace-nowrap"
                    >
                      {tag}
                    </div>
                  ))}
                  <div className="block bg-gray-200 text-xs px-3 py-2 rounded-xl m-1 whitespace-nowrap">
                    +{application.tags.length - 1} more
                  </div>
                </div>
              </a>
            </div>
          ))}
      </div>
    </div>
  );
}
