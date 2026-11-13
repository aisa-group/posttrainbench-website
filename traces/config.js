// Where the viewer's data lives: PostTrainBench's runs, on Hugging Face.
window.PTB_DATA_BASE = "https://huggingface.co/datasets/aisa-group/PostTrainBench-Trajectories/resolve/main/viewer_data/";
window.PTB_RAW_BASE  = "https://huggingface.co/datasets/aisa-group/PostTrainBench-Trajectories/tree/main/";

// Other suites, picked with ?suite=<name> (assets/suite.js). Their settings replace
// the ones above.
window.PTB_SUITES = {
  // PostTrainBench-Max (posttrainbench.com/max/traces/). Its dataset is private
  // until release, so the page shows nothing before then.
  max: {
    label: 'max traces',
    home: '/max/traces/',
    config: {
      PTB_DATA_BASE: "https://huggingface.co/datasets/aisa-group/PostTrainBench-Max-Trajectories/resolve/main/viewer_data/",
      PTB_RAW_BASE: null,
      PTB_DEFAULT_GROUP: 'none',
      PTB_DEFAULT_SORT: 'date-desc',
      PTB_INDEX_SUMMARY: false,
    },
  },
};
