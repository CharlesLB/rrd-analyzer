type MetaMessages = {
  readonly title: string;
  readonly description: string;
};

type CommonMessages = {
  readonly productName: string;
  readonly opensInNewTab: string;
  readonly version: string;
  readonly separator: string;
};

type HeaderMessages = {
  readonly navigation: string;
  readonly features: string;
  readonly demo: string;
  readonly download: string;
  readonly donate: string;
  readonly github: string;
  readonly menu: string;
};

type DownloadCallMessages = {
  readonly downloadFor: string;
  readonly getProduct: string;
  readonly fileDetail: string;
  readonly fileType: string;
  readonly unpackagedDetail: string;
};

type HeroMessages = {
  readonly releaseHeadline: string;
  readonly titleLead: string;
  readonly titleHighlight: string;
  readonly introduction: string;
  readonly tryDemo: string;
  readonly availability: string;
  readonly otherPlatforms: string;
  readonly screenshotTitle: string;
  readonly lightScreenshotDescription: string;
  readonly darkScreenshotDescription: string;
};

type FeatureMessages = {
  readonly ordinal: string;
  readonly title: string;
  readonly body: string;
  readonly screenshotDescription: string;
};

type LogTypeMessages = {
  readonly fatal: string;
  readonly error: string;
  readonly warning: string;
  readonly info: string;
  readonly debug: string;
};

type HighlightMessages = {
  readonly title: string;
  readonly body: string;
};

type FeaturesMessages = {
  readonly eyebrow: string;
  readonly title: string;
  readonly canvas: FeatureMessages & { readonly points: readonly string[] };
  readonly timeWindow: FeatureMessages;
  readonly insights: FeatureMessages & { readonly shortcutLead: string; readonly shortcutKey: string; readonly note: string };
  readonly logs: FeatureMessages & { readonly logTypes: LogTypeMessages };
  readonly export: FeatureMessages;
  readonly highlights: readonly HighlightMessages[];
};

type PrivacyPointMessages = {
  readonly title: string;
  readonly body: string;
};

type DemoMessages = {
  readonly eyebrow: string;
  readonly title: string;
  readonly introduction: string;
  readonly frameTitle: string;
  readonly open: string;
  readonly openDetail: string;
  readonly smallScreenTitle: string;
  readonly smallScreenBody: string;
  readonly smallScreenOpen: string;
  readonly privacyPoints: readonly PrivacyPointMessages[];
  readonly offlineTitle: string;
  readonly offlineBody: string;
  readonly offlineDownload: string;
};

type PlatformMessages = {
  readonly name: string;
  readonly requirement: string;
};

type PlatformsMessages = {
  readonly windows: PlatformMessages;
  readonly linux: PlatformMessages;
  readonly macos: PlatformMessages;
};

type ReleaseFileMessages = {
  readonly windowsInstaller: string;
  readonly windowsPortable: string;
  readonly debianPackage: string;
  readonly archPackage: string;
  readonly linuxArchive: string;
};

type DownloadMessages = {
  readonly eyebrow: string;
  readonly title: string;
  readonly introduction: string;
  readonly yourSystem: string;
  readonly platforms: PlatformsMessages;
  readonly files: ReleaseFileMessages;
  readonly unpackagedBody: string;
  readonly buildFromSource: string;
  readonly buildFromSourceDetail: string;
  readonly whatsNew: string;
  readonly fullChangelog: string;
  readonly releaseNotes: readonly string[];
  readonly otherWays: string;
  readonly allReleases: string;
  readonly sourceCode: string;
  readonly tryInBrowser: string;
};

type DonateMessages = {
  readonly title: string;
  readonly body: string;
  readonly cardTitle: string;
  readonly providerName: string;
  readonly providerMark: string;
  readonly providerDescription: string;
  readonly paymentsNote: string;
};

type FooterMessages = {
  readonly license: string;
  readonly github: string;
  readonly releases: string;
  readonly reportIssue: string;
  readonly toggleTheme: string;
};

export type Messages = {
  readonly meta: MetaMessages;
  readonly common: CommonMessages;
  readonly header: HeaderMessages;
  readonly downloadCall: DownloadCallMessages;
  readonly hero: HeroMessages;
  readonly features: FeaturesMessages;
  readonly demo: DemoMessages;
  readonly download: DownloadMessages;
  readonly donate: DonateMessages;
  readonly footer: FooterMessages;
};
