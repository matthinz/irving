import { SpiderOptions } from "./types";

const options: SpiderOptions = {
  allowedContentTypes: ["text/html"],
  databaseFile: "spider.db",

  getRequestTimeout: 10000,
  headRequestTimeout: 3000,

  // Responses larger than this size will not be stored.
  maxResponseBodySizeInBytes: 2 * 1000 * 1000,

  ignoreUrls: [
    // Common domains that we know we're not going to scrape and it doesn't
    // make sense to waste time examining right now.
    (u) => u.hostname === "www.twitter.com",
    (u) => u.hostname === "www.facebook.com",
    (u) => u.hostname === "www.linkedin.com",
    (u) => u.hostname === "www.pinterest.com",
    (u) => u.hostname === "www.youtube.com",

    // Files that are clearly not actually HTML
    (url) =>
      /\.(docx?|gif|jpe?g|mov|mp{3,4}|png|pdf|pptx?|rtf|txt|wmv|xlsx?|zip)$/i.test(
        url.pathname
      ),

    // Stop indexing paths once we hit an arbitrary-chosen depth
    (u) => u.pathname.split("/").length > 10,
  ],

  lowPriorityUrls: [],

  highPriorityUrls: [
    // Prioritize URLs that are requesting the root of a domain
    // (on the assumption this will increase the rate at which we discover new domains).
    (url) => url.pathname === "/",
  ],

  minTimeBetweenRequests: () => {
    // Less time between requests at night
    const now = new Date();
    if (now.getHours() >= 20 || now.getHours() <= 4) {
      return 250;
    }

    return 500;
  },

  /**
   * Platforms are used for reporting purposes.
   * Domains matching all provided signals will be assumed to use that platform.
   * Each domain is only allowed a single platform. If multiple platforms match,
   * the more specific one will be used.
   */
  platforms: [
    {
      label: "Adobe Experience Manager (AEM)",
      signals: ["aem"],
      specificity: 100,
    },
    {
      label: "DotNetNuke",
      signals: ["dot-net-nuke"],
      specificity: 100,
    },
    {
      label: "Sitecore",
      signals: ["sitecore"],
      specificity: 100,
    },
    {
      label: "ASP.NET (Custom)",
      signals: ["aspdotnet"],
      specificity: 10,
    },
    {
      label: "Classic ASP (Custom)",
      signals: ["classic-asp"],
      specificity: 10,
    },
    {
      label: "Cold Fusion (Custom)",
      signals: ["cold-fusion"],
      specificity: 10,
    },
    {
      label: "Concrete5",
      signals: ["concrete5"],
      specificity: 100,
    },
    {
      label: "Drupal",
      signals: ["drupal"],
      specificity: 100,
    },
    {
      label: "Liferay",
      signals: ["liferay"],
      specificity: 100,
    },
    {
      label: "Joomla",
      signals: ["joomla"],
      specificity: 100,
    },
    {
      label: "Mura CMS",
      signals: ["mura"],
      specificity: 100,
    },
    {
      label: "Netlify",
      signals: ["netlify"],
      specificity: 100,
    },
    {
      label: "PHP (Custom)",
      signals: ["php"],
      specificity: 10,
    },
    {
      label: "Plone",
      signals: ["plone"],
      specificity: 100,
    },
    {
      label: "Sharepoint",
      signals: ["sharepoint"],
      specificity: 100,
    },
    {
      label: "Squarespace",
      signals: ["squarespace"],
      specificity: 100,
    },
    {
      label: "Wix",
      signals: ["wix"],
      specificity: 100,
    },
    {
      label: "Wordpress",
      signals: ["wordpress"],
      specificity: 100,
    },
  ],

  canSpiderDomain: (domain: string): boolean | undefined => {
    return true;
  },
};

export default options;
