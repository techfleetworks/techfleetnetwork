// Promote the print-only font stylesheet to all media after load.
// Extracted from inline onload= so CSP can drop script-src 'unsafe-inline'.
(function () {
  var links = document.querySelectorAll('link[rel="stylesheet"][media="print"][data-onload-all]');
  for (var i = 0; i < links.length; i++) {
    (function (link) {
      link.addEventListener("load", function () { link.media = "all"; }, { once: true });
    })(links[i]);
  }
})();
