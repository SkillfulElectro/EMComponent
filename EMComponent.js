/**
 * @typedef {import('./EMComponent').EMComponentLifecycleCallback} EMComponentLifecycleCallback
 * @typedef {import('./EMComponent').EMComponentErrorCallback} EMComponentErrorCallback
 */

class EMComponent {
    static fetchedHtmlContent = new Map();
    static injectedCssUrls = new Set();
    static injectedExternalJsUrls = new Set();

    static logLevel = 'info'; // Levels: 'debug', 'info', 'warn', 'error', 'none'

    static #shouldLog(level) {
        const levels = { 'debug': 1, 'info': 2, 'warn': 3, 'error': 4, 'none': 5 };
        return levels[level] >= levels[this.logLevel];
    }

    originalHtmlUrl; resolvedHtmlUrl; basePath;
    hostElement = null;
    isAttached = false; isLoading = false; abortController = null;
    #injectedBodyNodes = [];
    #injectedHeadNodes = [];


    constructor(htmlUrl) {
        if (!htmlUrl || typeof htmlUrl !== 'string') { throw new Error('[EMComponent] Constructor requires a non-empty string htmlUrl.'); }
        this.originalHtmlUrl = htmlUrl;
        try { this.resolvedHtmlUrl = new URL(htmlUrl, document.baseURI).href; }
        catch (e) { throw new Error(`[EMComponent] Invalid htmlUrl "${htmlUrl}". Could not resolve against baseURI "${document.baseURI}".`); }
        try { const url = new URL(this.resolvedHtmlUrl); this.basePath = new URL('.', url).href; }
        catch (e) {
             this.basePath = new URL('.', document.baseURI).href;
             if (EMComponent.#shouldLog('warn')) {
                console.warn(`[EMComponent] Could not determine basePath from resolved URL "${this.resolvedHtmlUrl}". Falling back to document base path: "${this.basePath}"`);
             }
        }
         if (EMComponent.#shouldLog('debug')) {
            console.debug(`[EMComponent DEBUG] Initialized: original="${htmlUrl}", resolved="${this.resolvedHtmlUrl}", base="${this.basePath}"`);
         }
    }

    async #fetchHtmlContent() {
        if (EMComponent.fetchedHtmlContent.has(this.resolvedHtmlUrl)) {
             if (EMComponent.#shouldLog('debug')) console.debug(`[EMComponent DEBUG] Cache HIT for: ${this.resolvedHtmlUrl}`);
             return EMComponent.fetchedHtmlContent.get(this.resolvedHtmlUrl);
        }
        if (EMComponent.#shouldLog('debug')) console.debug(`[EMComponent DEBUG] Cache MISS. Fetching: ${this.resolvedHtmlUrl}`);

        if (!this.abortController) { this.abortController = new AbortController(); }
        const currentFetchController = this.abortController;

        try {
            const response = await fetch(this.resolvedHtmlUrl, { signal: currentFetchController.signal });
            if (!response.ok) throw new Error(`Fetch failed ${response.status}: ${response.statusText}`);
            const content = await response.text();
            EMComponent.fetchedHtmlContent.set(this.resolvedHtmlUrl, content);
            if (EMComponent.#shouldLog('debug')) console.debug(`[EMComponent DEBUG] Fetched successfully: ${this.resolvedHtmlUrl}`);
            return content;
        } catch (error) {
            if (error.name === 'AbortError') {
                 if (EMComponent.#shouldLog('info')) console.info(`[EMComponent] Fetch aborted for: ${this.resolvedHtmlUrl}`);
            } else {
                 if (EMComponent.#shouldLog('error')) console.error(`[EMComponent] Fetch error for "${this.resolvedHtmlUrl}":`, error);
            }
            throw error;
        } finally {
             if (this.abortController === currentFetchController && !currentFetchController.signal.aborted) {
                this.abortController = null;
             }
        }
    }

    attachToElementById(elementId, onComplete, onError) {
        const targetElement = document.getElementById(elementId);
        if (!targetElement) {
            const error = new Error(`[EMComponent] Target element with ID "${elementId}" not found.`);
            if (EMComponent.#shouldLog('error')) console.error(error.message);
            if (onError) onError(error);
            return;
        }
        this.attachToElement(targetElement, onComplete, onError);
    }

    #resolveUrl(relativeUrl) {
        try {
            if (!relativeUrl || /^(?:[a-z]+:)?\/\//i.test(relativeUrl) || /^(#|data:|blob:|mailto:|tel:|javascript:|ftp:|about:)/i.test(relativeUrl)) {
                return relativeUrl;
            }
            return new URL(relativeUrl, this.basePath).href;
        } catch (e) {
             if (EMComponent.#shouldLog('warn')) {
                console.warn(`[EMComponent] Could not resolve relative URL "${relativeUrl}" against base path "${this.basePath}".`, e);
             }
            return relativeUrl;
        }
    }

    attachToElement(targetElement, onComplete, onError) {
        const targetDesc = targetElement?.id ? `#${targetElement.id}` : (targetElement?.tagName || 'invalid target');
        const componentDesc = `"${this.originalHtmlUrl}" -> ${targetDesc}`;

        if (EMComponent.#shouldLog('info')) console.info(`[EMComponent] Attaching ${componentDesc}...`);

        if (!targetElement || !(targetElement instanceof Element)) {
            const error = new Error(`[EMComponent] Invalid targetElement provided for "${this.originalHtmlUrl}". Must be an Element.`);
             if (EMComponent.#shouldLog('error')) console.error(error.message);
            if (onError) onError(error);
            return;
        }
        if (this.isAttached || this.isLoading) {
             if (EMComponent.#shouldLog('warn')) {
                console.warn(`[EMComponent] Attachment skipped for ${componentDesc}: Already attached or loading.`);
             }
            if (this.isAttached && onComplete) onComplete(this);
            return;
        }

        this.isLoading = true;
        this.isAttached = false;
        if (EMComponent.#shouldLog('debug')) console.debug(`[EMComponent DEBUG State] isLoading: true, isAttached: false (Attach Start)`);
        this.hostElement = targetElement;
        this.#injectedBodyNodes = [];
        this.#injectedHeadNodes = [];

        (async () => {
            const scriptsToExecute = [];
            const headFragment = document.createDocumentFragment();
            const bodyFragment = document.createDocumentFragment();
            const docHead = document.head;

            try {

                const htmlContent = await this.#fetchHtmlContent();
                if (this.abortController?.signal.aborted) throw new DOMException("Aborted during fetch.", "AbortError");


                 if (EMComponent.#shouldLog('debug')) console.debug(`[EMComponent DEBUG] Parsing HTML for ${componentDesc}`);
                const parser = new DOMParser(); const parsedDoc = parser.parseFromString(htmlContent, 'text/html');
                const parseError = parsedDoc.querySelector("parsererror");
                if (parseError && EMComponent.#shouldLog('warn')) {
                    console.warn(`[EMComponent] HTML parsing error detected for ${componentDesc}:`, parseError.textContent);
                }


                 if (parsedDoc.head) {
                     if (EMComponent.#shouldLog('debug')) console.debug(`[EMComponent DEBUG] Processing <head> for ${componentDesc}`);
                    for (const el of parsedDoc.head.querySelectorAll('link[rel="stylesheet"][href], style')) {
                         try {
                            const nodeToInject = el.cloneNode(true);
                            let skipInjection = false;
                            if (nodeToInject.tagName === 'LINK') {
                                const originalHref = nodeToInject.getAttribute('href');
                                if (originalHref) {
                                     const absoluteUrl = this.#resolveUrl(originalHref);
                                     nodeToInject.setAttribute('href', absoluteUrl);
                                     if (EMComponent.injectedCssUrls.has(absoluteUrl)) {
                                         if (EMComponent.#shouldLog('info')) console.info(`[EMComponent] Skipping duplicate CSS: ${absoluteUrl}`);
                                         skipInjection = true;
                                     } else if (!/^(#|data:|blob:|mailto:|tel:|javascript:|ftp:|about:)/i.test(originalHref)) {
                                         EMComponent.injectedCssUrls.add(absoluteUrl);
                                     }
                                } else {
                                    if (EMComponent.#shouldLog('warn')) console.warn(`[EMComponent] Skipping <link rel="stylesheet"> with no href in ${componentDesc}.`);
                                    skipInjection = true;
                                }
                            }
                            if (!skipInjection) {
                                 headFragment.appendChild(nodeToInject);
                                 this.#injectedHeadNodes.push(nodeToInject);
                            }
                        } catch (e) {
                             if (EMComponent.#shouldLog('warn')) console.warn(`[EMComponent] Error processing head element <${el.tagName}> in ${componentDesc}:`, e); }
                    }
                 }


                if (parsedDoc.body) {
                     if (EMComponent.#shouldLog('debug')) console.debug(`[EMComponent DEBUG] Processing <body> for ${componentDesc}`);
                    for (const node of parsedDoc.body.childNodes) {
                        const nodeToInject = node.cloneNode(true);
                        if (nodeToInject.nodeType === Node.ELEMENT_NODE) {

                            const elementsToRewrite = nodeToInject.matches('img[src], iframe[src], source[src], audio[src], video[src], track[src], embed[src], object[data], a[href]')
                                ? [nodeToInject]
                                : nodeToInject.querySelectorAll('img[src], iframe[src], source[src], audio[src], video[src], track[src], embed[src], object[data], a[href]');
                            elementsToRewrite.forEach(el => {
                                const attribute = el.hasAttribute('src') ? 'src' : (el.hasAttribute('data') ? 'data' : 'href');
                                 if (attribute) {
                                    const originalValue = el.getAttribute(attribute);
                                    if (originalValue) {
                                        el.setAttribute(attribute, this.#resolveUrl(originalValue));
                                    }
                                 }
                            });


                             const scriptElements = nodeToInject.matches('script') ? [nodeToInject] : nodeToInject.querySelectorAll('script');
                             scriptElements.forEach(scriptEl => {
                                 const src = scriptEl.getAttribute('src');
                                 let absoluteSrc = null;
                                 if (src) { absoluteSrc = this.#resolveUrl(src); }
                                 scriptsToExecute.push({ type: src ? 'external' : 'inline', absoluteSrc: absoluteSrc, content: src ? null : scriptEl.textContent, originalElement: scriptEl.cloneNode(true) });
                                 scriptEl.remove();
                             });
                        }
                        bodyFragment.appendChild(nodeToInject);
                    }
                }

                 if (this.abortController?.signal.aborted) throw new DOMException("Aborted after processing.", "AbortError");


                 if (EMComponent.#shouldLog('debug')) console.debug(`[EMComponent DEBUG] Injecting content for ${componentDesc}`);
                 if (headFragment.hasChildNodes()) {
                    docHead.appendChild(headFragment);
                 }
                 this.hostElement.innerHTML = '';
                 this.#injectedBodyNodes = Array.from(bodyFragment.childNodes);
                 this.hostElement.appendChild(bodyFragment);
                 if (EMComponent.#shouldLog('debug')) console.debug(`[EMComponent DEBUG] Content injected for ${componentDesc}`);

                 await new Promise(resolve => requestAnimationFrame(resolve));


                 if (EMComponent.#shouldLog('debug')) console.debug(`[EMComponent DEBUG] Executing ${scriptsToExecute.length} scripts for ${componentDesc}...`);

                for (const scriptInfo of scriptsToExecute) {
                     if (this.abortController?.signal.aborted) throw new DOMException("Aborted during script execution", "AbortError");


                     await new Promise((resolve, reject) => {
                         try {
                             const newScript = document.createElement('script');
                             for (const attr of scriptInfo.originalElement.attributes) { if (attr.name !== 'src' || scriptInfo.type === 'external') newScript.setAttribute(attr.name, attr.value); }

                             if (scriptInfo.type === 'external') {
                                 if (!scriptInfo.absoluteSrc) {
                                     if (EMComponent.#shouldLog('warn')) console.warn(`[EMComponent] Skipping external script with invalid/unresolved src in ${componentDesc}.`);
                                     resolve(); return;
                                 }
                                 if (EMComponent.injectedExternalJsUrls.has(scriptInfo.absoluteSrc)) {
                                     if (EMComponent.#shouldLog('info')) console.info(`[EMComponent] Skipping duplicate external script: ${scriptInfo.absoluteSrc}`);
                                     resolve(); return;
                                 }
                                 EMComponent.injectedExternalJsUrls.add(scriptInfo.absoluteSrc);
                                 newScript.src = scriptInfo.absoluteSrc;
                                 newScript.onload = () => {
                                     if (EMComponent.#shouldLog('debug')) console.debug(`[EMComponent DEBUG] External script loaded: ${scriptInfo.absoluteSrc}`);
                                     resolve();
                                 };
                                 newScript.onerror = (event) => {
                                     if (EMComponent.#shouldLog('error')) console.error(`[EMComponent] Error loading external script: ${scriptInfo.absoluteSrc}`, event);
                                     EMComponent.injectedExternalJsUrls.delete(scriptInfo.absoluteSrc);
                                     resolve();
                                 };
                                 docHead.appendChild(newScript);
                                 this.#injectedHeadNodes.push(newScript);
                             } else {
                                 newScript.textContent = scriptInfo.content;
                                 docHead.appendChild(newScript);
                                 this.#injectedHeadNodes.push(newScript);
                                 if (EMComponent.#shouldLog('debug')) console.debug(`[EMComponent DEBUG] Inline script executed for ${componentDesc}.`);
                                 resolve();
                             }
                         } catch (scriptError) {
                             if (EMComponent.#shouldLog('error')) console.error(`[EMComponent] Error processing script in ${componentDesc}:`, scriptError);
                             resolve();
                         }
                     });
                 }
                 if (EMComponent.#shouldLog('debug')) console.debug(`[EMComponent DEBUG] All scripts processed for ${componentDesc}.`);


                this.isAttached = true;
                this.isLoading = false;
                if (EMComponent.#shouldLog('debug')) console.debug(`[EMComponent DEBUG State] isLoading: false, isAttached: true (Attach Success)`);

                if (EMComponent.#shouldLog('info')) {
                    console.log(`%c[EMComponent] Attached ${componentDesc} successfully.`, 'color: green;');
                }

                if (onComplete) { try { onComplete(this); } catch (e) { if (EMComponent.#shouldLog('error')) console.error(`[EMComponent] Error in onComplete callback for ${componentDesc}:`, e); } }

            } catch (error) {

                 this.isLoading = false;
                 this.isAttached = false;
                 if (EMComponent.#shouldLog('debug')) console.debug(`[EMComponent DEBUG State] isLoading: false, isAttached: false (Attach Error/Abort)`);

                 const isAbort = error?.name === 'AbortError';
                 const errorMessage = isAbort ? 'Attachment aborted.' : (error?.message || 'Unknown error during attachment.');

                 if (this.hostElement) {
                     try {
                        const errorP = document.createElement('p'); errorP.style.cssText = 'color: red; font-family: sans-serif; border: 1px solid red; padding: 10px; margin: 0;';
                        errorP.textContent = `Component Load Error: ${errorMessage}`;
                        this.hostElement.innerHTML = ''; this.hostElement.appendChild(errorP);
                     } catch (displayError) { }
                 }


                 if (isAbort) {
                      if (EMComponent.#shouldLog('info')) console.info(`[EMComponent] Attachment aborted for ${componentDesc}.`);
                 } else {
                      if (EMComponent.#shouldLog('error')) console.error(`[EMComponent] Failed to attach ${componentDesc}:`, error);
                 }

                 this.#attemptCleanup();

                 if (onError) { try { onError(error); } catch (e) { if (EMComponent.#shouldLog('error')) console.error(`[EMComponent] Error in onError callback for ${componentDesc}:`, e); } }
            } finally {
                 this.isLoading = false;
                 if (EMComponent.#shouldLog('debug') && !this.isAttached) {
                    console.debug(`[EMComponent DEBUG State] isLoading: false (Attach Finally - Error Path)`);
                 }
                 if (this.abortController && !this.abortController.signal.aborted) {
                    this.abortController = null;
                 }
            }
        })();
    }

    #attemptCleanup() {
         if (EMComponent.#shouldLog('debug')) console.debug(`[EMComponent DEBUG] Attempting cleanup for ${this.originalHtmlUrl}`);
         const docHead = document.head;
         let removedHeadCount = 0;

         const headNodes = [...this.#injectedHeadNodes];
         const bodyNodes = [...this.#injectedBodyNodes];

         headNodes.forEach(node => {
             if (node.parentNode === docHead) {
                 docHead.removeChild(node);
                 removedHeadCount++;
             }
             if (node.tagName === 'LINK' && node.href) EMComponent.injectedCssUrls.delete(node.href);
             if (node.tagName === 'SCRIPT' && node.src && EMComponent.injectedExternalJsUrls.has(node.src)) {
                  EMComponent.injectedExternalJsUrls.delete(node.src);
             }
         });


         if (this.hostElement) {
             bodyNodes.forEach(node => {
                  if (node.parentNode === this.hostElement) {
                      this.hostElement.removeChild(node);
                  }
             });
         }

         if (EMComponent.#shouldLog('debug')) console.debug(`[EMComponent DEBUG] Cleanup: Removed ${removedHeadCount} node(s) from head. Cleared host children for ${this.originalHtmlUrl}.`);
         this.#injectedHeadNodes = [];
         this.#injectedBodyNodes = [];


          if (removedHeadCount > 0 && EMComponent.#shouldLog('warn')) {
              console.warn("[EMComponent] Global node cleanup attempted. Note: Dynamically removing scripts/styles and associated event listeners can be unreliable and may cause side effects.");
          }
    }

    detach() {
        const componentDesc = `"${this.originalHtmlUrl}" from ${this.hostElement?.id ? `#${this.hostElement.id}` : (this.hostElement?.tagName || 'previous host')}`;

        if (!this.isAttached && !this.isLoading) {
             if (EMComponent.#shouldLog('debug')) console.debug(`[EMComponent DEBUG] Detach skipped for ${componentDesc}: Not attached or loading.`);
             return false;
        }

        if (EMComponent.#shouldLog('info')) console.info(`[EMComponent] Detaching ${componentDesc}...`);

        const wasLoading = this.isLoading;
        const wasAttached = this.isAttached;

        if (wasLoading && this.abortController) {
             if (EMComponent.#shouldLog('info')) console.info(`[EMComponent] Aborting loading process during detach for ${componentDesc}.`);
            this.abortController.abort();
        } else if (wasAttached) {
             this.#attemptCleanup();
        }


        if (this.hostElement) {
            try { this.hostElement.innerHTML = ''; } catch (e) { if (EMComponent.#shouldLog('error')) console.error(`[EMComponent] Error clearing host element during detach for ${componentDesc}:`, e); }
        }

        this.hostElement = null;
        this.isAttached = false;
        this.isLoading = false;
        this.abortController = null;
        if (EMComponent.#shouldLog('debug')) console.debug(`[EMComponent DEBUG State] isLoading: false, isAttached: false (Detach Complete)`);

        if (EMComponent.#shouldLog('info')) console.info(`[EMComponent] Detached ${componentDesc}.`);
        return true;
    }
}


/** @callback EMComponentLifecycleCallback @param {EMComponent} componentInstance */
/** @callback EMComponentErrorCallback @param {Error} error */