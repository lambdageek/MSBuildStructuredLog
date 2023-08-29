
import { Node, SearchResult } from '../shared/model';
import { NodeRequester } from './post-to-vs';

export class SearchController {
    constructor(readonly nodeRequester: NodeRequester) {
    }

    // ensure that the node in the results is fully explored
    async summarizeResult(result: SearchResult): Promise<SearchResult<Node>> {
        const node = await this.nodeRequester.fullyExpore(result.nodeId);
        return { ancestors: result.ancestors, nodeId: node };
    }
}

