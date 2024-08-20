import { EleventyHtmlBasePlugin } from '@11ty/eleventy';
import bundlePlugin from '@11ty/eleventy-plugin-bundle';
import rssPlugin from '@11ty/eleventy-plugin-rss';
import syntaxHighlightPlugin from '@11ty/eleventy-plugin-syntaxhighlight';
import markdownItAnchor from 'markdown-it-anchor';

/**
 * Get a list of all posts, sorted by ascending date.
 *
 * @returns {object[]} - a list of posts
 */
function getPosts(collection) {
    return [
        ...collection.getFilteredByGlob('./src/posts/*.md'),
        ...collection.getFilteredByGlob('./src/posts/*/*.md'),
    ].sort((a, b) => a.date - b.date);
}

export default function(eleventyConfig) {
    eleventyConfig.addPassthroughCopy('./src/**/*.jpg');
    eleventyConfig.addPassthroughCopy('./src/**/*.png');
    eleventyConfig.addPassthroughCopy('./src/**/*.svg');
    eleventyConfig.addPassthroughCopy('./src/**/*.vtt');
    eleventyConfig.addPassthroughCopy('./src/**/*.webm');
    eleventyConfig.addPassthroughCopy({
        './src/assets': '/assets',
        './src/CNAME': '/CNAME',
        './src/favicon.ico': '/favicon.ico',
        './public': '/public',
    });

    // Plugins
    eleventyConfig.addPlugin(EleventyHtmlBasePlugin);
    eleventyConfig.addPlugin(bundlePlugin);
    eleventyConfig.addPlugin(rssPlugin);
    eleventyConfig.addPlugin(syntaxHighlightPlugin, {
        preAttributes: { tabindex: 0 },
        templateFormats: ['md'],
    });

    // Filters
    eleventyConfig.addFilter('readableDate', (date) => {
        return date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    });

    eleventyConfig.addFilter('htmlDateString', rssPlugin.dateToRfc822);

    // Posts
    eleventyConfig.addCollection('posts', (collection) => {
        return getPosts(collection).map(page => {
            page.data.layout = 'post';

            /* FIXME: this chokes up in GitHub's CI
             if (process.env.NODE_ENV === 'production')
                 page.data.date = 'git Created';
             */

            return page;
        });
    });

    eleventyConfig.addCollection('gnome', (collection) => {
        return getPosts(collection).filter(page => {
            return !page.data?.tags?.includes('personal');
        });
    });

    eleventyConfig.addCollection('latest', (collection) => {
        return getPosts(collection)
            .reverse()
            .slice(0, 5 /* Latest */);
    });

    eleventyConfig.addFilter('excerpt', (content) => {
        const marker = '</p>';
        const position = content?.indexOf(marker);

        return position >= 0 ? content.slice(0, position + marker.length) : '';
    });

    // Tags
    eleventyConfig.addFilter('getTags', (collection) => {
        const tagSet = new Set();

        for (const item of collection)
            item.data.tags?.forEach(tag => tagSet.add(tag));

        return Array.from(tagSet).sort();
    });

    // Markdown
    eleventyConfig.amendLibrary('md', (mdLib) => {
        mdLib.use(markdownItAnchor, {
            permalink: markdownItAnchor.permalink.ariaHidden({
                placement: 'before',
                class: 'header-anchor',
                symbol: '#',
                ariaHidden: false,
            }),
            level: [1, 2, 3],
            slugify: eleventyConfig.getFilter('slugify')
        });
    });

    return {
        dir: {
            input: 'src',
        },
        templateFormats: ['md', 'njk'],
    };
};
