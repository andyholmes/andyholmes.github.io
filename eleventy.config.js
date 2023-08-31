const process = require('process');

const { EleventyHtmlBasePlugin } = require('@11ty/eleventy');
const pluginBundle = require('@11ty/eleventy-plugin-bundle');
const pluginRss = require('@11ty/eleventy-plugin-rss');
const pluginSyntaxHighlight = require('@11ty/eleventy-plugin-syntaxhighlight');
const markdownItAnchor = require('markdown-it-anchor');


module.exports = function(eleventyConfig) {
    eleventyConfig.addPassthroughCopy({
        './src/assets': '/assets',
        './src/CNAME': '/CNAME',
        './src/favicon.ico': '/favicon.ico',
    });

    // Plugins
    eleventyConfig.addPlugin(EleventyHtmlBasePlugin);
    eleventyConfig.addPlugin(pluginBundle);
    eleventyConfig.addPlugin(pluginRss);
    eleventyConfig.addPlugin(pluginSyntaxHighlight, {
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

    eleventyConfig.addFilter('htmlDateString', (date) => {
        return pluginRss.dateToRfc822(date);
    });

    // Posts
    eleventyConfig.addCollection('posts', (collection) => {
        return collection.getFilteredByGlob('./src/posts/*.md').map(page => {
            page.data.layout = 'post';

            if (process.env.NODE_ENV === 'production')
                page.data.date = 'git Created';

            return page;
        });
    });

    eleventyConfig.addCollection('gnome', (collection) => {
        return collection.getFilteredByGlob('./src/posts/*.md').filter(page => {
            return !page.data.tags.includes('personal');
        });
    });

    eleventyConfig.addCollection('latest', (collection) => {
        return collection.getFilteredByGlob('./src/posts/*.md')
            .reverse()
            .slice(0, 5 /* Latest */);
    });

    eleventyConfig.addShortcode('excerpt', (item) => {
        const separator = '</p>';
        const position = item.templateContent?.indexOf(separator);

        return position >= 0
            ? item.templateContent.slice(0, position + separator.length)
            : '';
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
