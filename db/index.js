require('dotenv').config()
const argon2 = require('argon2')
const {Pool, types} = require('pg')
const shortid = require('shortid')

//returns raw timestamp instead of converting to a js Date obj
types.setTypeParser(1114, str => str)

const pool = new Pool()

function query(query, params) {
    return pool.query(query, params)
}

function numToOrderedAlpha(num) {
    var first = Math.ceil(num/676)

    var second = Math.ceil(num/26)%26
    second = second ? second : 26

    var third = Math.ceil(num%26)
    third = third ? third : 26

    return String.fromCharCode(96 + first) +
        String.fromCharCode(96 + second) +
        String.fromCharCode(96 + third)
}

//user
exports.createUser = (username, password) => {
    return argon2.hash(password)
        .then(hash => query(
            'insert into tuser(username, password) values($1, $2)',
            [username, hash]))
}

exports.getUserWithUsername = (username) => {
    return query(
        'select user_id, username, password from tuser where username = $1',
        [username]
    )
}

//group
exports.createGroup = (userId, name) => {
    return query(
        'insert into tgroup(created_by, owned_by, name) values($1, $2, $3)',
        [userId, userId, name]
    )
}

exports.getGroupWithName = (name) => {
    return query(`
        select
            group_id,
            owned_by,
            name
        from
            tgroup
        where
            lower(name) = lower($1)`,
        [name]
    )
}

exports.getGroups = () => {
    return query(
        'select name from tgroup order by name'
    )
}

//post
exports.createPost = (groupId, userId, title, textContent) => {
    return query(
        'insert into tpost(public_id, group_id, user_id, title, text_content) values($1, $2, $3, $4, $5)',
        [shortid.generate(), groupId, userId, title, textContent]
    )
}

exports.getPostsWithGroupId = (groupId) => {
    return query(`
        select
            p.public_id,
            p.title,
            p.created_on::timestamp(0),
            u.username
        from
            tpost p
        join
            tuser u on u.user_id = p.user_id
        where
            p.group_id = $1
        order by
            p.created_on desc`,
        [groupId]
    )
}

exports.getPostWithGroupAndPublic = (groupName, publicId) => {
    return query(
        `
        select
            p.post_id,
            p.title,
            p.created_on::timestamp(0),
            p.text_content,
            u.username,
            p.public_id
        from
            tpost p
        join
            tuser u on u.user_id = p.user_id
        join
            tgroup g on g.group_id = p.group_id
        where
            p.public_id = $1 and
            g.name = $2`,
        [publicId, groupName]
    )
}

//comment
exports.createPostComment = (postId, userId, content) => {
    
    /*TODO: figure out how to put this postId in
    the query as a query param, currently
    concat returns type 'text' which the ~
    operator doesn't accept*/
    let lQuery = parseInt(postId) + '.*{1}'

    return query(`
        select
            count(1) as count
        from
            ttest
        where
            path ~ $1`,
        [lQuery]).then(res => query(`
        insert into ttest
            (post_id, user_id, text_content, path, public_id)
        values
            ($1, $2, $3, $4, $5)`,
        [postId, userId, content,
            postId + '.' + numToOrderedAlpha(parseInt(res.rows[0].count) + 1),
            shortid.generate()])
    )
}

exports.createCommentComment = (postId, userId, content, parentPath) => {
    let lQuery = parentPath + '.*{1}'

    return query(`
        select
            count(1) as count
        from
            ttest
        where
            path ~ $1`,
        [lQuery]).then(res => query(`
        insert into ttest
            (post_id, user_id, text_content, path, public_id)
        values
            ($1, $2, $3, $4, $5)`,
        [postId, userId, content,
            parentPath + '.' + numToOrderedAlpha(parseInt(res.rows[0].count) + 1),
            shortid.generate()])
    )
}

exports.getPostComments = (postId) => {
    return query(`
        select
            c.text_content,
            c.path,
            u.username,
            c.created_on::timestamp(0),
            c.public_id
        from
            ttest c
        join
            tuser u on u.user_id = c.user_id
        where
            c.path <@ $1
        order by
            c.path`,
        [postId])
}

exports.getCommentComments = (path) => {
    return query(`
        select
            c.text_content,
            c.path,
            u.username,
            c.created_on::timestamp(0),
            c.public_id
        from
            ttest c
        join
            tuser u on u.user_id = c.user_id
        where
            c.path <@ $1 and
            not (c.path ~ $2)
        order by
            c.path`,
        [path, path])
}

exports.getCommentWithGroupAndPublics = (groupName, publicPostId, publicCommentId) => {
    return query(`
        select
            c.text_content,
            c.created_on::timestamp(0),
            c.path,
            c.post_id,
            u.username
        from
            ttest c
        join
            tuser u on u.user_id = c.user_id
        join
            tpost p on p.post_id = c.post_id
        join
            tgroup g on g.group_id = p.group_id
        where
            c.public_id = $1 and
            p.public_id = $2 and
            g.name = $3`,
        [publicCommentId, publicPostId, groupName]
    )
}
