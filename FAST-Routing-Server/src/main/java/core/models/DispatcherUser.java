package core.models;

public class DispatcherUser extends User {
    public DispatcherUser() { super(); }

    public DispatcherUser(String id, String username, String password, String displayName) {
        super(id, username, password, "dispatcher", null, displayName);
    }
}
