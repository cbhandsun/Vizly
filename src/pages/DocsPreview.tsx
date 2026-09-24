import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowLeft,
    Bot,
    CircleCheck,
    CloudCog,
    KeyRound,
    Network,
    Rocket,
    Search,
    Share2,
    X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getDocsPreviewCopy } from './docsPreviewContent';
import {
    DOCS_SEARCH_MAX_LENGTH,
    filterDocsPreviewTopics,
    resolveDocsPreviewLocale,
    resolveVisibleDocsTopic,
    sanitizeDocsSearchQuery,
} from './docsPreviewModel';
import './DocsPreview.css';

const TOPIC_ICONS = {
    'getting-started': Rocket,
    'diagram-editing': Network,
    'ai-assistant': Bot,
    sharing: Share2,
    'storage-sync': CloudCog,
    'keyboard-accessibility': KeyRound,
} as const;

const DocsPreview = () => {
    const { i18n } = useTranslation();
    const locale = resolveDocsPreviewLocale(i18n.resolvedLanguage ?? i18n.language);
    const copy = getDocsPreviewCopy(locale);
    const [query, setQuery] = useState('');
    const [selectedTopicId, setSelectedTopicId] = useState(copy.topics[0]?.id ?? '');
    const [articleFocusRequest, setArticleFocusRequest] = useState(0);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const articleHeadingRef = useRef<HTMLHeadingElement>(null);
    const filteredTopics = useMemo(
        () => filterDocsPreviewTopics(copy.topics, query),
        [copy.topics, query],
    );
    const activeTopic = resolveVisibleDocsTopic(filteredTopics, selectedTopicId);

    useLayoutEffect(() => {
        if (articleFocusRequest === 0) return;
        articleHeadingRef.current?.focus({ preventScroll: true });
    }, [articleFocusRequest]);

    const selectTopic = (topicId: string, focusArticle: boolean) => {
        setSelectedTopicId(topicId);
        if (focusArticle) {
            setArticleFocusRequest((request) => request + 1);
        }
    };

    const clearSearch = () => {
        setQuery('');
        setSelectedTopicId(copy.topics[0]?.id ?? '');
        searchInputRef.current?.focus({ preventScroll: true });
    };

    return (
        <div className="docs-page" data-smoke-ready="docs-preview">
            <header className="docs-page__header">
                <div className="docs-page__header-inner">
                    <a className="docs-page__back" href="#/manage">
                        <ArrowLeft aria-hidden="true" />
                        {copy.backToWorkspace}
                    </a>
                    <div className="docs-page__brand-row">
                        <div aria-hidden="true" className="docs-page__brand-mark">
                            <Network />
                        </div>
                        <span>{copy.productName}</span>
                    </div>
                    <div className="docs-page__hero-copy">
                        <p>{locale === 'zh' ? '产品文档' : 'PRODUCT DOCUMENTATION'}</p>
                        <h1>{copy.pageTitle}</h1>
                        <span>{copy.pageDescription}</span>
                    </div>
                    <div className="docs-page__search-wrap">
                        <Search aria-hidden="true" className="docs-page__search-icon" />
                        <label className="sr-only" htmlFor="docs-search">{copy.searchLabel}</label>
                        <input
                            id="docs-search"
                            maxLength={DOCS_SEARCH_MAX_LENGTH}
                            onChange={(event) => setQuery(sanitizeDocsSearchQuery(event.target.value))}
                            placeholder={copy.searchPlaceholder}
                            ref={searchInputRef}
                            type="search"
                            value={query}
                        />
                        {query ? (
                            <button
                                aria-label={`${copy.clearSearch}：${copy.searchLabel}`}
                                className="docs-page__search-clear"
                                onClick={clearSearch}
                                type="button"
                            >
                                <X aria-hidden="true" />
                            </button>
                        ) : null}
                    </div>
                </div>
            </header>

            <div className="docs-page__workspace">
                <aside className="docs-page__sidebar">
                    <div className="docs-page__sidebar-heading">
                        <span>{copy.topicNavigation}</span>
                        <span aria-live="polite" role="status">{copy.resultStatus(filteredTopics.length)}</span>
                    </div>
                    <nav aria-label={copy.topicNavigation} className="docs-page__topic-list">
                        {filteredTopics.map((topic) => {
                            const TopicIcon = TOPIC_ICONS[topic.id as keyof typeof TOPIC_ICONS] ?? CircleCheck;
                            const isActive = activeTopic?.id === topic.id;
                            return (
                                <button
                                    aria-current={isActive ? 'page' : undefined}
                                    className={`docs-page__topic${isActive ? ' docs-page__topic--active' : ''}`}
                                    key={topic.id}
                                    onClick={(event) => selectTopic(topic.id, event.detail === 0)}
                                    type="button"
                                >
                                    <TopicIcon aria-hidden="true" />
                                    <span>
                                        <strong>{topic.title}</strong>
                                        <small>{topic.summary}</small>
                                    </span>
                                </button>
                            );
                        })}
                    </nav>
                </aside>

                <main aria-label={copy.articleLabel} className="docs-page__main">
                    {activeTopic ? (
                        <article className="docs-page__article">
                            <p className="docs-page__eyebrow">{activeTopic.eyebrow}</p>
                            <h2 ref={articleHeadingRef} tabIndex={-1}>{activeTopic.title}</h2>
                            <p className="docs-page__lead">{activeTopic.summary}</p>
                            {activeTopic.sections.map((section) => (
                                <section className="docs-page__section" key={section.title}>
                                    <h3>{section.title}</h3>
                                    <p>{section.body}</p>
                                    {section.bullets ? (
                                        <ul>
                                            {section.bullets.map((bullet) => (
                                                <li key={bullet}><CircleCheck aria-hidden="true" />{bullet}</li>
                                            ))}
                                        </ul>
                                    ) : null}
                                </section>
                            ))}
                            <footer className="docs-page__article-footer">
                                <CircleCheck aria-hidden="true" />
                                {copy.updatedLabel} · {copy.updatedValue}
                            </footer>
                        </article>
                    ) : (
                        <section aria-labelledby="docs-empty-title" className="docs-page__empty">
                            <Search aria-hidden="true" />
                            <h2 id="docs-empty-title">{copy.noResultsTitle}</h2>
                            <p>{copy.noResultsHint}</p>
                            <button onClick={clearSearch} type="button">{copy.clearSearch}</button>
                        </section>
                    )}
                </main>
            </div>
        </div>
    );
};

export default DocsPreview;
