import { FlowchartCtrl } from './flowchart_ctrl';
import grafana from './grafana_func';

grafana.loadCss();

// This hack stops drawio from being able to actually redirect us to pages
// Note the "link" attribute must start with "Request:"
// document.domain = "localhost";
window.open = function (open) {
    return function(url: string | URL | undefined, name: any, features: any) {
        let target = url!.toString().split("/").at(-1)!;
        if (target.startsWith("Request:")) {
            let query = target.replace("Request:", "");
            fetch(query, {mode:"no-cors"})
            return null;
        }
        return open.call(window, url, name, features);
    };
}(window.open);

export { FlowchartCtrl as PanelCtrl };
