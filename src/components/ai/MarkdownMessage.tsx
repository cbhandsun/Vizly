import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownMessageProps {
    content: string;
}

const MarkdownMessage: React.FC<MarkdownMessageProps> = ({ content }) => (
    <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
    </ReactMarkdown>
);

export default MarkdownMessage;
