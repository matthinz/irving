import cheerio from "cheerio";
import { SpiderRequest } from "../../types";
import { aemSignal } from "./aem";
import { akamaiSignal } from "./akamai";
import { apacheSignal } from "./apache";
import { aspDotNetSignal } from "./aspdotnet";
import { awsElbSignal } from "./aws-elb";
import { azureSignal } from "./azure";
import { classicAspSignal } from "./classic-asp";
import { cloudflareSignal } from "./cloudflare";
import { awsCloudfrontSignal } from "./aws-cloudfront";
import { coldFusionSignal } from "./cold-fusion";
import { concrete5Signal } from "./concrete5";
import { dotNetNukeSignal } from "./dotnetnuke";
import { drupalSignal } from "./drupal";
import { javaSignal } from "./java";
import { nginxSignal } from "./nginx";
import { oracleServiceBusSignal } from "./oracle-service-bus";
import { phpSignal } from "./php";
import { sharepointSignal } from "./sharepoint";
import { sitecoreSignal } from "./sitecore";
import { squarespaceSignal } from "./squarespace";
import {
  DomSignalChecker,
  RequestSignalChecker,
  SignalChecker,
  UrlSignalChecker,
} from "./types";
import { wixSignal } from "./wix";
import { wordpressSignal } from "./wordpress";
import { netlifySignal } from "./netlify";
import { liferaySignal } from "./liferay";
import { muraSignal } from "./mura";
import { joomlaSignal } from "./joomla";
import { ploneSignal } from "./plone";

const ALL_SIGNALS = [
  aemSignal,
  akamaiSignal,
  apacheSignal,
  aspDotNetSignal,
  awsElbSignal,
  awsCloudfrontSignal,
  azureSignal,
  classicAspSignal,
  cloudflareSignal,
  coldFusionSignal,
  concrete5Signal,
  dotNetNukeSignal,
  drupalSignal,
  javaSignal,
  joomlaSignal,
  liferaySignal,
  muraSignal,
  netlifySignal,
  nginxSignal,
  oracleServiceBusSignal,
  phpSignal,
  ploneSignal,
  sharepointSignal,
  sitecoreSignal,
  squarespaceSignal,
  sharepointSignal,
  wixSignal,
  wordpressSignal,
];

export async function indexPageSignals(
  req: SpiderRequest,
  $?: cheerio.Root
): Promise<string[]> {
  const values = ALL_SIGNALS.map((signal) => {
    if (isUrlSignalChecker(signal) && signal.urlMatches(req.url)) {
      return signal.name;
    }
    if (isRequestSignalChecker(signal) && signal.requestMatches(req)) {
      return signal.name;
    }

    if (isDomSignalChecker(signal)) {
      if (!req.error) {
        // NOTE: Lazily doing cheerio load (expensive)
        $ = $ ?? cheerio.load(req.body);
        if (signal.matches(req, $)) {
          return signal.name;
        }
      }
    }
  }).filter((x) => !!x) as string[];

  return values;
}

function isDomSignalChecker(
  checker: SignalChecker
): checker is DomSignalChecker {
  return checker && typeof (checker as any).matches === "function";
}

function isRequestSignalChecker(
  checker: SignalChecker
): checker is RequestSignalChecker {
  return checker && typeof (checker as any).requestMatches === "function";
}

function isUrlSignalChecker(
  checker: SignalChecker
): checker is UrlSignalChecker {
  return checker && typeof (checker as any).urlMatches === "function";
}
