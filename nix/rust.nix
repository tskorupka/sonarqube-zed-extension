{pkgs, ...}: {
  languages.rust = {
    enable = true;
    channel = "stable";
    targets = [
      "wasm32-wasip2"
    ];
  };
}
