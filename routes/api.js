const express = require('express')
const db = require('../db')
const myMisc = require('../misc.js')
const pug = require('pug')
const OAuth2Server = require('oauth2-server')
const Request = require('oauth2-server').Request
const Response = require('oauth2-server').Response

//
const router = express.Router()

//
const oauth = new OAuth2Server({
    model: require('../oauth-model.js')
})

//
router.get(
    '/posts',
    async (req, res) => {

        //
        let page = 1

        if(typeof req.query.p !== 'undefined') {
            page = parseInt(req.query.p)

            if(isNaN(page)) {
                page = 1
            }
        }

        //
        const oauthData = await oauthAuthenticate(req, res)

        //
        const isDiscoverMode = oauthData
            ? (oauthData.user.post_mode == 'discover')
            : (typeof req.query.viewmode !== 'undefined' && req.query.viewmode.toLowerCase() == 'discover')

        const userId = oauthData ? oauthData.user.user_id : -1
        const filterUserId = oauthData
            ? (oauthData.user.eyes ? oauthData.user.eyes : oauthData.user.user_id)
            : 1

        const sort = myMisc.getPostSort(req)
        const timeZone = oauthData ? oauthData.user.time_zone : 'UTC'

        const {rows} = await db.getPosts(
            userId,
            timeZone,
            page,
            isDiscoverMode,
            filterUserId,
            sort)

        //
        let rows2 = []

        for(const i in rows) {
            let v = rows[i]

            rows2.push({
                post_id: v.public_id,
                title: v.is_visible ? v.title : false,
                link: v.is_visible ? v.link : false,
                post_time: v.created_on_raw,
                by: v.username,
                num_comments: v.num_comments,
                groups: v.is_visible ? v.tags : false
            })
        }

        res.json(rows2)
    }
)

router.get(
    '/post',
    async (req, res) => {

        //
        if(typeof req.query.postid === 'undefined') {
            return res.status(400).json({
                errors: ['no postid in URL'],
            })
        }

        //
        const oauthData = await oauthAuthenticate(req, res)

        //
        const postPublicId = req.query.postid
        const userId = oauthData ? oauthData.user.user_id : -1
        const filterUserId = oauthData
            ? (oauthData.user.eyes ? oauthData.user.eyes : oauthData.user.user_id)
            : 1

        const timeZone = oauthData ? oauthData.user.time_zone : 'UTC'

        //
        const {rows} = await db.getPostWithPublic2(
            postPublicId,
            timeZone,
            userId,
            filterUserId)

        //
        if(rows.length) {

            //
            const isAllowed = await db.isAllowedToViewPost(
                rows[0].private_group_ids,
                userId)

            if(!isAllowed) {
                return res.status(403).json({
                    errors: ["this post is private and you don't have access"],
                })
            }

            //
            const isDiscoverMode = oauthData
                ? (oauthData.user.post_mode == 'discover')
                : (typeof req.query.viewmode !== 'undefined' && req.query.viewmode.toLowerCase() == 'discover')

            //
            let page = 1

            if(typeof req.query.p !== 'undefined') {
                page = parseInt(req.query.p)

                if(isNaN(page)) {
                    page = 1
                }
            }

            //
            const{rows:comments} = await db.getPostComments(
                rows[0].post_id,
                timeZone,
                userId,
                isDiscoverMode,
                filterUserId,
                page)

            //
            let comments2 = []

            for(const i in comments) {
                const c = comments[i]
                const dotCount = (c.path.match(/\./g)||[]).length

                comments2.push({
                    comment_text: c.is_visible ? c.text_content : false,
                    indent_level: dotCount - 1,
                    by: c.username,
                    comment_time: c.created_on_raw,
                    comment_id: c.public_id
                })
            }
            
            let r = {
                title: rows[0].is_visible ? rows[0].title : false,
                link: rows[0].is_visible ? rows[0].link : false,
                post_text: rows[0].is_visible ? rows[0].text_content : false,
                post_time: rows[0].created_on_raw,
                by: rows[0].username,
                comments: comments2,
                groups: rows[0].is_visible ? rows[0].tags : false
            }

            res.json(r)
        }
        else {
            return res.status(404).json({
                errors: ["no post with that postid"],
            })
        }
    }
)

//
router.post(
    '/post',
    async (req, res) => {

        //
        const title = (typeof req.body.title === 'undefined') ? '' : req.body.title
        const text_content = (typeof req.body.text_content === 'undefined') ? '' : req.body.text_content
        const link = (typeof req.body.link === 'undefined') ? '' : req.body.link
        const tags = (typeof req.body.tags === 'undefined') ? '' : req.body.tags

        //
        const oauthData = await oauthAuthenticate(req, res)

        //
        if(!oauthData) {
            return res.status(401).json({
                errors: ['invalid or no user auth'],
            })
        }

        //
        const [errors, wsCompressedTitle, trimTags] = await db.validateNewPost(
            title,
            link,
            tags,
            oauthData.user.user_id)

        //
        if(errors.length) {
            return res.status(400).json({
                errors: errors,
            })
        }

        //
        const publicPostId = await db.createPost(
            oauthData.user.user_id,
            wsCompressedTitle,
            text_content,
            link,
            trimTags)

        //
        return res.json({
            post_id: publicPostId,
        })
    }
)

//
router.get(
    '/comment',
    async (req, res) => {

        //
        if(typeof req.query.commentid === 'undefined') {
            return res.status(400).json({
                errors: ['no commentid in URL'],
            })
        }

        //
        const oauthData = await oauthAuthenticate(req, res)

        //
        const commentPublicId = req.query.commentid
        const userId = oauthData ? oauthData.user.user_id : -1
        const filterUserId = oauthData
            ? (oauthData.user.eyes ? oauthData.user.eyes : oauthData.user.user_id)
            : 1

        const timeZone = oauthData ? oauthData.user.time_zone : 'UTC'

        //
        const {rows} = await db.getCommentWithPublic2(
            commentPublicId,
            timeZone,
            userId,
            filterUserId)

        //
        if(rows.length) {

            //
            const isAllowed = await db.isAllowedToViewPost(
                rows[0].private_group_ids,
                userId)

            if(!isAllowed) {
                return res.status(403).json({
                    errors: ["this comment is private and you don't have access"],
                })
            }

            //
            const isDiscoverMode = oauthData
                ? (oauthData.user.post_mode == 'discover')
                : (typeof req.query.viewmode !== 'undefined' && req.query.viewmode.toLowerCase() == 'discover')

            //
            let page = 1

            if(typeof req.query.p !== 'undefined') {
                page = parseInt(req.query.p)

                if(isNaN(page)) {
                    page = 1
                }
            }

            //
            const{rows:comments} = await db.getCommentComments(
                rows[0].path,
                timeZone,
                userId,
                isDiscoverMode,
                filterUserId,
                page)

            //
            let comments2 = []
            const rootDotCount = (rows[0].path.match(/\./g)||[]).length

            for(const i in comments) {
                const c = comments[i]
                const dotCount = (c.path.match(/\./g)||[]).length

                comments2.push({
                    comment_text: c.is_visible ? c.text_content : false,
                    indent_level: dotCount - rootDotCount - 1,
                    by: c.username,
                    comment_time: c.created_on_raw,
                    comment_id: c.public_id
                })
            }
            
            let r = {
                comment_text: rows[0].is_visible ? rows[0].text_content : false,
                comment_time: rows[0].created_on_raw,
                by: rows[0].username,
                comments: comments2
            }

            res.json(r)
        }
        else {
            return res.status(404).json({
                errors: ["no comment with that commentid"],
            })
        }
    }
)

//
router.post(
    '/comment',
    async (req, res) => {

        //
        const oauthData = await oauthAuthenticate(req, res)

        //
        if(!oauthData) {
            return res.status(401).json({
                errors: ['invalid or no user auth'],
            })
        }

        //
        const postId = req.body.post_id
        const commentId = req.body.comment_id
        const isPostId = typeof postId !== 'undefined'
        const isCommentId = typeof commentId !== 'undefined'
        const isBoth = isPostId && isCommentId
        const isNeither = !isPostId && !isCommentId
        const initialErrors = []

        //
        if(isNeither) {
            initialErrors.push('must supply an existing post_id or comment_id')
        }

        //
        if(isBoth) {
            initialErrors.push('do not send both a post_id and comment_id')
        }

        //
        if(typeof req.body.text_content === 'undefined') {
            initialErrors.push('missing text_content value')
        }

        //
        if(initialErrors.length > 0) {
            return res.status(400).json({errors: initialErrors})
        }

        //
        const filterUserId = oauthData.user.eyes
            ? oauthData.user.eyes
            : oauthData.user.user_id

        //
        if(isPostId) {

            //
            const {rows:[row]} = await db.getPostWithPublic2(
                postId,
                oauthData.user.time_zone,
                oauthData.user.user_id,
                filterUserId)

            //
            if(!row) {
                return res.status(404).json({errors: ['no such post']})
            }

            //
            const isAllowed = await db.isAllowedToViewPost(row.private_group_ids, oauthData.user.user_id)

            if(!isAllowed) {
                return res.status(403).json({
                    errors: ['this post is private and the active user does not have access']
                })
            }

            //
            const [compressedComment, errors] = myMisc.processComment(req.body.text_content)

            //
            if(errors.length > 0) {
                return res.status(400).json({errors: errors})
            }

            //
            const {rows:data1} = await db.createPostComment(
                row.post_id,
                oauthData.user.user_id,
                compressedComment)

            //todo: use a postgres trigger for this
            await db.incPostNumComments(row.post_id)

            //
            const publicCommentId = data1[0].public_id
            
            return res.json({
                comment_id: publicCommentId,
            })
        }
        else {

            //
            const {rows:[row]} = await db.getCommentWithPublic2(
                commentId,
                oauthData.user.time_zone,
                oauthData.user.user_id,
                filterUserId)

            if(!row) {
                return res.status(404).json({errors: ['no such comment']})
            }

            //
            const isAllowed = await db.isAllowedToViewPost(row.private_group_ids, oauthData.user.user_id)

            if(!isAllowed) {
                return res.status(403).json({
                    errors: ['this comment is private and the active user does not have access']
                })
            }

            //
            const [compressedComment, errors] = myMisc.processComment(req.body.text_content)

            //
            if(errors.length > 0) {
                return res.status(400).json({errors: errors})
            }

            //
            const {rows:data1} = await db.createCommentComment(
                row.post_id,
                oauthData.user.user_id,
                compressedComment,
                row.path,
                oauthData.user.time_zone)

            //todo: use trigger
            await db.incPostNumComments(row.post_id)

            //
            const publicCommentId = data1[0].public_id
            
            return res.json({
                comment_id: publicCommentId,
            })
        }
    }
)

//
module.exports = router

//
async function oauthAuthenticate(req, res) {
    const request = new Request(req)
    const response = new Response(res)
    const options = {}
    let oauthData = null

    try {
        oauthData = await oauth.authenticate(request, response, options)
    }
    catch(e) {
        // basically no access token in header
        // or wrong access token in header
        // either way, do nothing and proceed
        // with API call render
    }

    return oauthData
}
